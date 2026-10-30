import { Indexable, LuauState, Mutable } from './vendor/luau-web/index.js';

const runtimes = new Map();
let nextInstanceId = 0;

function stringify(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function xyz(value, fallback = [0, 0, 0]) {
  if (Array.isArray(value)) return value.slice(0, 3).map((part, index) => Number(part) || fallback[index]);
  return ['X', 'Y', 'Z'].map((axis, index) => Number(value?.[axis]) || fallback[index]);
}

function colorHex(value) {
  if (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) return value;
  const channels = ['R', 'G', 'B'].map(key => Math.round(Math.max(0, Math.min(1, Number(value?.[key]) || 0)) * 255));
  return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function makeRuntime(context, id) {
  const instances = new Map();
  const signals = new Map();
  const eventRegistry = Mutable({});
  const pendingEvents = new Map();
  const startedAt = Date.now();
  let flushing = false;
  let started = false;
  let publishedStats = false;
  let workspace;
  let localPlayer;
  let playerGui;
  let state = null;

  const send = (payload) => self.postMessage({ ...payload, id });
  const childrenOf = parent => [...instances.values()].filter(item => item.Parent === parent && !item.Destroyed);
  const scheduleSignalFire = (targetId, eventName) => {
    if (started) queueMicrotask(() => fire(targetId, eventName));
    else pendingEvents.set(`${targetId}:${eventName}`, { targetId, eventName });
  };
  const method = (getReceiver, callback) => Indexable((...args) => {
    const receiver = typeof getReceiver === 'function' ? getReceiver() : getReceiver;
    const hasReceiver = args[0] === receiver || args.length > callback.length;
    return callback(...(hasReceiver ? args.slice(1) : args));
  });

  function signalFor(targetId, eventName) {
    const key = `${targetId}:${eventName}`;
    if (signals.has(key)) return signals.get(key).signal;
    const listeners = Mutable({ Count: 0 });
    const onceListeners = new Set();
    eventRegistry[key] = listeners;
    let signal;
    signal = Mutable({
      Connect: method(() => signal, callback => {
        if (typeof callback !== 'function') return { Disconnect: Indexable(() => {}) };
        listeners.Count += 1;
        listeners[String(listeners.Count)] = callback;
        if (targetId === 'players' && eventName === 'PlayerAdded') {
          scheduleSignalFire(targetId, eventName);
        }
        return { Disconnect: Indexable(() => {
          for (let index = 1; index <= listeners.Count; index += 1) {
            if (listeners[String(index)] === callback) {
              listeners[String(index)] = null;
              break;
            }
          }
        }) };
      }),
      Once: method(() => signal, callback => {
        if (typeof callback !== 'function') return;
        listeners.Count += 1;
        listeners[String(listeners.Count)] = callback;
        onceListeners.add(listeners.Count);
        if (targetId === 'players' && eventName === 'PlayerAdded') {
          scheduleSignalFire(targetId, eventName);
        }
      }),
      Wait: method(() => signal, () => Promise.resolve())
    });
    signals.set(key, { signal, listeners, onceListeners });
    return signal;
  }

  function describe(item) {
    const parent = item.Parent;
    const isUi = ['TextButton', 'TextLabel', 'ImageLabel', 'Frame', 'ScrollingFrame'].includes(item.ClassName);
    const itemData = {
      id: item.__rewindId,
      name: String(item.Name || item.ClassName || 'Instance'),
      kind: String(item.Kind || item.ClassName || 'Part'),
      position: xyz(item.Position),
      rotation: xyz(item.Rotation),
      size: xyz(item.Size, [1, 1, 1]),
      color: colorHex(item.Color),
      anchored: item.Anchored !== false,
      transparency: Math.max(0, Math.min(1, Number(item.Transparency) || 0)),
      visible: item.Visible !== false && !item.Destroyed,
      text: String(item.Text || item.Name || ''),
      ui: isUi,
      parentId: parent?.__rewindId || null,
      destroyed: Boolean(item.Destroyed)
    };
    if (isUi && parent === playerGui) itemData.playerGui = true;
    return itemData;
  }

  function sendStats() {
    if (!localPlayer) return;
    const folder = childrenOf(localPlayer).find(item => item.Name === 'leaderstats');
    if (!folder && !publishedStats) return;
    publishedStats = Boolean(folder);
    const values = folder ? childrenOf(folder).filter(item => /Value$/.test(item.ClassName)) : [];
    send({
      type: 'stats',
      player: String(localPlayer.DisplayName || localPlayer.Name || 'Player'),
      stats: values.map(item => ({ name: String(item.Name), value: item.Value ?? '' }))
    });
  }

  function flush() {
    if (flushing) return;
    flushing = true;
    try {
      for (const item of instances.values()) {
        if (item === workspace || item === localPlayer || item === playerGui) continue;
        if (item.Destroyed || item.Parent === workspace || item.Parent === playerGui || item.__rewindId.startsWith('scene-')) {
          send({ type: 'instance', item: describe(item) });
        }
      }
      sendStats();
    } finally {
      flushing = false;
    }
  }

  function makeSignalObject(targetId) {
    return {
      Activated: signalFor(targetId, 'Activated'),
      MouseButton1Click: signalFor(targetId, 'Activated'),
      Changed: signalFor(targetId, 'Changed'),
      Touched: signalFor(targetId, 'Touched')
    };
  }

  function makeInstance(className, initial = {}, idHint = '') {
    const idValue = String(idHint || initial.__rewindId || `script-${++nextInstanceId}`);
    const initialData = {
      __rewindId: idValue,
      Name: className,
      ClassName: className,
      Parent: null,
      Position: vector(0, 0, 0),
      Size: vector(4, 1, 2),
      Rotation: vector(0, 0, 0),
      CFrame: null,
      Color: color(0.5, 0.4, 0.9),
      Anchored: true,
      Transparency: 0,
      Visible: true,
      Text: '',
      Value: valueDefault(className),
      Destroyed: false,
      ...initial
    };
    const base = Mutable(initialData);
    const instance = new Proxy(base, {
      set(target, property, value) {
        target[property] = value;
        if (property === 'CFrame' && value) {
          target.Position = value.Position || vector(value.X, value.Y, value.Z);
          if (value.Rotation) target.Rotation = value.Rotation;
        }
        if (['Name', 'Parent', 'Position', 'Rotation', 'CFrame', 'Size', 'Color', 'Anchored', 'Transparency', 'Visible', 'Text', 'Value', 'Destroyed'].includes(property)) queueMicrotask(flush);
        return true;
      }
    });
    Object.assign(instance, makeSignalObject(idValue), {
      GetChildren: method(instance, () => childrenOf(instance)),
      GetDescendants: method(instance, () => {
        const descendants = [];
        const append = parent => childrenOf(parent).forEach(child => { descendants.push(child); append(child); });
        append(instance);
        return descendants;
      }),
      FindFirstChild: method(instance, name => childrenOf(instance).find(child => child.Name === String(name)) || null),
      WaitForChild: method(instance, name => childrenOf(instance).find(child => child.Name === String(name)) || null),
      IsA: method(instance, name => instance.ClassName === String(name) || (String(name) === 'BasePart' && ['Part', 'MeshPart', 'SpawnLocation'].includes(instance.ClassName))),
      SetAttribute: method(instance, (name, value) => { instance[`Attribute:${String(name)}`] = value; }),
      GetAttribute: method(instance, name => instance[`Attribute:${String(name)}`] ?? null),
      Destroy: method(instance, () => { instance.Destroyed = true; instance.Parent = null; }),
      Clone: method(instance, () => makeInstance(instance.ClassName, {
        Name: `${instance.Name} (Clone)`,
        Position: vector(...xyz(instance.Position)),
        Size: vector(...xyz(instance.Size)),
        Color: color(instance.Color?.R, instance.Color?.G, instance.Color?.B),
        Anchored: instance.Anchored
      }))
    });
    instances.set(idValue, instance);
    return instance;
  }

  function valueDefault(className) {
    if (className === 'IntValue' || className === 'NumberValue') return 0;
    if (className === 'BoolValue') return false;
    if (className === 'StringValue') return '';
    return null;
  }

  function vector(x = 0, y = 0, z = 0) {
    return Mutable({ X: Number(x) || 0, Y: Number(y) || 0, Z: Number(z) || 0 });
  }

  function color(r = 0, g = 0, b = 0) {
    return Mutable({ R: Number(r) || 0, G: Number(g) || 0, B: Number(b) || 0 });
  }

  workspace = makeInstance('Workspace', { __rewindId: 'workspace', Gravity: Number(context.gravity) || 18 });
  localPlayer = makeInstance('Player', {
    __rewindId: 'local-player',
    Name: String(context.playerName || 'Player'),
    DisplayName: String(context.playerName || 'Player'),
    UserId: 0,
    Character: null
  });
  playerGui = makeInstance('PlayerGui', { __rewindId: 'player-gui', Parent: localPlayer });
  localPlayer.PlayerGui = playerGui;

  for (const item of Array.isArray(context.objects) ? context.objects : []) {
    const className = item.kind === 'spawn' ? 'SpawnLocation' : item.kind === 'camera' ? 'Camera' : item.kind === 'sphere' ? 'Part' : 'Part';
    const obj = makeInstance(className, {
      __rewindId: String(item.id || `scene-${++nextInstanceId}`),
      Name: String(item.name || item.kind || className),
      Position: vector(...xyz(item.position)),
      Size: vector(...xyz(item.size, [1, 1, 1])),
      Rotation: vector(...xyz(item.rotation)),
      Color: color(...rgbFromHex(item.color)),
      Anchored: item.anchored !== false,
      Transparency: Number(item.transparency) || 0,
      Visible: item.visible !== false,
      Parent: workspace
    });
    obj.Kind = String(item.kind || 'block');
  }
  for (const item of Array.isArray(context.ui) ? context.ui : []) {
    makeInstance(String(item.kind || 'Frame'), {
      __rewindId: String(item.id || `ui-${++nextInstanceId}`),
      Name: String(item.name || item.kind || 'UI'),
      Text: String(item.text || ''),
      Position: vector(...xyz(item.position)),
      Size: vector(...xyz(item.size, [200, 60])),
      Rotation: vector(0, 0, 0),
      Color: color(...rgbFromHex(item.color)),
      Visible: item.visible !== false,
      Parent: playerGui
    });
  }

  const localScript = context.parentId
    ? instances.get(String(context.parentId)) || makeInstance(String(context.parentKind || 'Instance'), { Name: String(context.parentName || context.parentKind || 'Parent'), __rewindId: String(context.parentId) })
    : context.parentKind === 'Workspace' ? workspace
      : context.parentKind === 'StarterGui' ? playerGui
        : makeInstance(String(context.parentKind || 'ServerScriptService'), { __rewindId: String(context.parentKind || 'ServerScriptService') });

  const rootServices = {
    Workspace: workspace,
    Players: null,
    StarterGui: makeInstance('StarterGui', { __rewindId: 'StarterGui' }),
    ServerScriptService: makeInstance('ServerScriptService', { __rewindId: 'ServerScriptService' }),
    ReplicatedStorage: makeInstance('ReplicatedStorage', { __rewindId: 'ReplicatedStorage' }),
    Lighting: makeInstance('Lighting', { __rewindId: 'Lighting', Brightness: 2, ClockTime: 14 }),
    RunService: null,
    HttpService: null,
    DataStoreService: null,
    TweenService: null
  };
  let players;
  players = Mutable({
      Name: 'Players',
      ClassName: 'Players',
      LocalPlayer: localPlayer,
      PlayerAdded: signalFor('players', 'PlayerAdded'),
      PlayerRemoving: signalFor('players', 'PlayerRemoving'),
      GetPlayers: method(() => players, () => [localPlayer]),
      GetPlayerByUserId: method(() => players, () => null)
    });
  rootServices.Players = players;
  let runService;
  runService = Mutable({
      IsClient: Indexable(() => true),
      IsServer: Indexable(() => false),
      Heartbeat: signalFor('RunService', 'Heartbeat'),
      RenderStepped: signalFor('RunService', 'RenderStepped')
    });
  rootServices.RunService = runService;
  let httpService;
  httpService = Mutable({
      GenerateGUID: method(() => httpService, () => `local-${crypto.randomUUID()}`),
      JSONEncode: method(() => httpService, value => JSON.stringify(value)),
      JSONDecode: method(() => httpService, value => JSON.parse(String(value)))
    });
  rootServices.HttpService = httpService;
  let dataStoreService;
  dataStoreService = Mutable({
      GetDataStore: method(() => dataStoreService, () => ({
        GetAsync: Indexable(() => null),
        SetAsync: Indexable(() => false),
        UpdateAsync: Indexable(() => null),
        RemoveAsync: Indexable(() => false)
      }))
    });
  rootServices.DataStoreService = dataStoreService;
  let tweenService;
  tweenService = Mutable({
      Create: method(() => tweenService, (target, _info, properties) => ({
        Play: Indexable(() => { if (properties && typeof properties === 'object') Object.assign(target, properties); }),
        Cancel: Indexable(() => {})
      }))
    });
  rootServices.TweenService = tweenService;
  let game;
  game = Mutable({
    Name: 'REWIND browser sandbox',
    GetService: method(() => game, name => rootServices[String(name)] || { Name: String(name), ClassName: String(name) }),
    FindService: method(() => game, name => rootServices[String(name)] || null)
  });
  Object.assign(workspace, {
    GetChildren: method(workspace, () => childrenOf(workspace)),
    FindFirstChild: method(workspace, name => childrenOf(workspace).find(item => item.Name === String(name)) || null),
    WaitForChild: method(workspace, name => childrenOf(workspace).find(item => item.Name === String(name)) || null)
  });

  const scriptObject = makeInstance(String(context.scriptType || 'LocalScript'), {
    __rewindId: `script:${id}`,
    Name: String(context.scriptName || 'Script'),
    Parent: localScript
  });
  const vector3 = {
    new: Indexable((x, y, z) => vector(x, y, z)),
    zero: vector(0, 0, 0),
    one: vector(1, 1, 1)
  };
  const color3 = {
    new: Indexable((r, g, b) => color(r, g, b)),
    fromRGB: Indexable((r, g, b) => color((Number(r) || 0) / 255, (Number(g) || 0) / 255, (Number(b) || 0) / 255))
  };
  const cframe = {
    new: Indexable((x = 0, y = 0, z = 0) => Mutable({ X: Number(x) || 0, Y: Number(y) || 0, Z: Number(z) || 0, Position: vector(x, y, z), __type: 'CFrame' })),
    identity: Mutable({ X: 0, Y: 0, Z: 0, Position: vector(), __type: 'CFrame' })
  };
  const task = {
    wait: Indexable((...args) => {
      const seconds = args.at(-1);
      return new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(10, Number(seconds) || 0) * 1000)));
    }),
    spawn: Indexable((...args) => scheduleCallback(args.at(-1))),
    defer: Indexable((...args) => scheduleCallback(args.at(-1))),
    delay: Indexable((...args) => scheduleCallback(args.at(-1), args.at(-2)))
  };
  const instance = {
    new: Indexable(className => makeInstance(String(className || 'Instance')))
  };
  const environment = {
    game,
    workspace,
    script: scriptObject,
    __rewindEventCallbacks: eventRegistry,
    __rewindLocalPlayer: localPlayer,
    Players: rootServices.Players,
    Instance: instance,
    Vector3: vector3,
    Color3: color3,
    CFrame: cframe,
    Enum: new Proxy({}, { get: (_target, key) => new Proxy({}, { get: (_value, enumKey) => ({ Name: String(enumKey), Value: 0, EnumType: String(key) }) }) }),
    task,
    wait: task.wait,
    tick: Indexable(() => (Date.now() - startedAt) / 1000),
    time: Indexable(() => (Date.now() - startedAt) / 1000),
    typeof: Indexable(value => value?.__type || typeof value),
    print: Indexable((...values) => send({ type: 'output', level: 'log', text: values.map(stringify).join('\t') })),
    warn: Indexable((...values) => send({ type: 'output', level: 'warn', text: values.map(stringify).join('\t') })),
    error: Indexable((...values) => send({ type: 'output', level: 'error', text: values.map(stringify).join('\t') }))
  };

  async function fire(targetId, eventName) {
    if (!started) {
      pendingEvents.set(`${targetId}:${eventName}`, { targetId, eventName });
      return;
    }
    const entry = signals.get(`${targetId}:${eventName}`);
    if (!entry || !state || state.destroyed) return;
    const callbackArgs = targetId === 'players' && eventName === 'PlayerAdded' ? '__rewindLocalPlayer' : '';
    const source = `local listeners = __rewindEventCallbacks[${JSON.stringify(`${targetId}:${eventName}`)}]\nif listeners then\n for index = 1, listeners.Count do\n  local callback = listeners[tostring(index)]\n  if callback then callback(${callbackArgs}) end\n end\nend`;
    try {
      const result = state.loadstring(source, 'REWIND event', true)();
      if (result && typeof result.then === 'function') await result;
      for (const index of entry.onceListeners) entry.listeners[String(index)] = null;
      entry.onceListeners.clear();
    } catch (error) {
      send({ type: 'output', level: 'error', text: String(error?.message || error) });
    }
    flush();
  }

  async function start() {
    started = true;
    const queued = [...pendingEvents.values()];
    pendingEvents.clear();
    for (const event of queued) await fire(event.targetId, event.eventName);
  }

  function scheduleCallback(callback, seconds = 0) {
    if (typeof callback !== 'function') return;
    const targetId = `task-${id}-${++nextInstanceId}`;
    const key = `${targetId}:Run`;
    const listeners = Mutable({ Count: 1, '1': callback });
    eventRegistry[key] = listeners;
    signals.set(key, { listeners, onceListeners: new Set() });
    setTimeout(() => scheduleSignalFire(targetId, 'Run'), Math.max(0, Math.min(10, Number(seconds) || 0) * 1000));
  }

  function dispose() {
    for (const runtime of runtimes.values()) {
      try { runtime.state.destroy(); } catch { /* State is already stopped. */ }
    }
    runtimes.clear();
  }

  return {
    environment,
    get state() { return state; },
    set state(value) { state = value; },
    fire,
    start,
    flush,
    dispose,
    send
  };
}

function rgbFromHex(value) {
  const hex = typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.slice(1) : '8271db';
  return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
}

async function runScript(data) {
  const { id, source = '', context = {} } = data;
  const runtime = makeRuntime(context, id);
  try {
    const state = await LuauState.createAsync(runtime.environment);
    runtime.state = state;
    runtimes.set(String(id), runtime);
    const result = state.loadstring(String(source), String(context.scriptName || 'REWIND Script'), true)();
    if (result && typeof result.then === 'function') await result;
    await runtime.start();
    runtime.flush();
    runtime.send({ type: 'done' });
  } catch (error) {
    runtime.send({ type: 'error', message: String(error?.message || error) });
    runtime.send({ type: 'done' });
  }
}

async function activate(data) {
  const runtime = runtimes.get(String(data.id));
  if (!runtime) return;
  await runtime.fire(String(data.targetId), String(data.eventName || 'Activated'));
  runtime.send({ type: 'done', eventId: data.eventId });
}

self.onmessage = async event => {
  const data = event.data || {};
  if (data.type === 'run') return runScript(data);
  if (data.type === 'activate') return activate(data);
  if (data.type === 'stop') {
    for (const runtime of runtimes.values()) {
      try { runtime.state?.destroy(); } catch { /* Runtime may already have stopped. */ }
    }
    runtimes.clear();
    close();
  }
};

self.postMessage({ type: 'ready' });
