import { SOUND_NAMES, type SoundName } from "./sound-player";
import {
  createWebAudioSoundPlayer,
  type WebAudioContext,
  type WebAudioSource,
} from "./web-audio-sound-player";

const URLS = Object.fromEntries(SOUND_NAMES.map((name) => [name, `/sounds/${name}.wav`])) as Record<
  SoundName,
  string
>;

type FakeBuffer = { decodedFrom: string };

function fakeContext() {
  const started: { buffer: FakeBuffer; gain: number }[] = [];
  const context = {
    state: "suspended" as AudioContextState,
    resumes: 0,
    started,
    destination: { node: "destination" },
    failDecodeOf: null as string | null,
    resume() {
      context.resumes += 1;
      context.state = "running";
      return Promise.resolve();
    },
    decodeAudioData(data: ArrayBuffer) {
      const name = new TextDecoder().decode(data);
      if (name === context.failDecodeOf) return Promise.reject(new Error("bad wav"));
      return Promise.resolve({ decodedFrom: name });
    },
    createGain() {
      const gain = {
        gain: { value: 1 },
        connect: (node: unknown) => {
          if (node !== context.destination) throw new Error("gain not routed to the speakers");
          return node;
        },
      };
      return gain;
    },
    createBufferSource() {
      let routedGain: { gain: { value: number } } | null = null;
      const source: WebAudioSource = {
        buffer: null,
        connect: (node) => {
          routedGain = node as { gain: { value: number } };
          return node;
        },
        start: () => {
          if (routedGain === null) throw new Error("source not connected");
          started.push({ buffer: source.buffer as FakeBuffer, gain: routedGain.gain.value });
        },
      };
      return source;
    },
  };
  return context;
}

/** A fetch that answers each sound URL with its name as bytes (so decoding can tell them apart). */
function fakeFetch() {
  const requested: string[] = [];
  let failing: string | null = null;
  const fetch = jest.fn(async (url: string) => {
    requested.push(url);
    if (url === failing) throw new TypeError("Load failed");
    const name = url.replace(/^\/sounds\/(.*)\.wav$/, "$1");
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode(name).buffer as ArrayBuffer,
    };
  });
  return { fetch, requested, failOn: (url: string) => void (failing = url) };
}

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

function setup() {
  const context = fakeContext();
  const network = fakeFetch();
  const log = jest.fn();
  const played: SoundName[] = [];
  const createContext = jest.fn(() => context as unknown as WebAudioContext);
  const player = createWebAudioSoundPlayer({
    urls: URLS,
    fetch: network.fetch,
    createContext,
    log,
    onPlayed: (name) => played.push(name),
  });
  return { player, context, network, log, played, createContext };
}

describe("createWebAudioSoundPlayer", () => {
  it("downloads every sound once with fetch (so the service worker serves it offline)", async () => {
    const { network, player } = setup();
    await flush();

    expect([...network.requested].sort()).toEqual(Object.values(URLS).sort());

    player.play("tap");
    player.play("tap");
    await flush();
    expect(network.requested).toHaveLength(SOUND_NAMES.length);
  });

  it("creates no audio context before the first sound (browsers start it only after a tap)", async () => {
    const { createContext } = setup();
    await flush();

    expect(createContext).not.toHaveBeenCalled();
  });

  it("resumes the context inside the tap and plays the decoded sound from memory", async () => {
    const { player, context, played } = setup();
    await flush();

    player.play("correct");
    expect(context.resumes).toBe(1);
    await flush();

    expect(context.started.map((s) => s.buffer.decodedFrom)).toEqual(["correct"]);
    expect(played).toEqual(["correct"]);
  });

  it("creates a single context and decodes each sound once", async () => {
    const { player, context, createContext } = setup();
    const decode = jest.spyOn(context, "decodeAudioData");
    await flush();

    player.play("tap");
    await flush();
    player.play("tap");
    player.play("wrong");
    await flush();

    expect(createContext).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(context.started.map((s) => s.buffer.decodedFrom)).toEqual(["tap", "tap", "wrong"]);
  });

  it("keeps the tap quieter than the feedback sounds", async () => {
    const { player, context } = setup();
    await flush();

    player.play("tap");
    player.play("correct");
    await flush();

    const [tap, correct] = context.started;
    expect(tap!.gain).toBeLessThan(correct!.gain);
  });

  it("plays a sound asked for before its download finished, once it arrives", async () => {
    const { player, context } = setup();

    player.play("almost");
    await flush();

    expect(context.started.map((s) => s.buffer.decodedFrom)).toEqual(["almost"]);
  });

  it("stays silent while disabled, and plays again once enabled", async () => {
    const { player, context, createContext, played } = setup();
    await flush();

    player.setEnabled(false);
    player.play("tap");
    await flush();
    expect(createContext).not.toHaveBeenCalled();
    expect(context.started).toEqual([]);

    player.setEnabled(true);
    player.play("tap");
    await flush();
    expect(played).toEqual(["tap"]);
  });

  it("does not play a sound that finished decoding after the learner muted", async () => {
    const { player, context } = setup();

    player.play("wrong");
    player.setEnabled(false);
    await flush();

    expect(context.started).toEqual([]);
  });

  it("logs a failed download without throwing, and the other sounds still play", async () => {
    const context = fakeContext();
    const network = fakeFetch();
    network.failOn(URLS.streak);
    const log = jest.fn();
    const player = createWebAudioSoundPlayer({
      urls: URLS,
      fetch: network.fetch,
      createContext: () => context as unknown as WebAudioContext,
      log,
    });
    await flush();

    expect(() => player.play("streak")).not.toThrow();
    player.play("complete");
    await flush();

    expect(log).toHaveBeenCalledWith(expect.stringContaining("streak"), expect.any(TypeError));
    expect(context.started.map((s) => s.buffer.decodedFrom)).toEqual(["complete"]);
  });

  it("logs an HTTP error as a failed download", async () => {
    const log = jest.fn();
    const player = createWebAudioSoundPlayer({
      urls: URLS,
      fetch: async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
      createContext: () => fakeContext() as unknown as WebAudioContext,
      log,
    });
    await flush();

    player.play("tap");
    await flush();

    expect(log).toHaveBeenCalledWith(expect.stringContaining("tap"), expect.any(Error));
  });

  it("logs a failed decode without throwing", async () => {
    const { player, context, log, played } = setup();
    context.failDecodeOf = "wrong";
    await flush();

    player.play("wrong");
    await flush();

    expect(log).toHaveBeenCalledWith(expect.stringContaining("wrong"), expect.any(Error));
    expect(played).toEqual([]);
  });

  it("logs when the browser has no Web Audio, and never throws", async () => {
    const log = jest.fn();
    const player = createWebAudioSoundPlayer({
      urls: URLS,
      fetch: fakeFetch().fetch,
      createContext: () => {
        throw new Error("AudioContext is not defined");
      },
      log,
    });
    await flush();

    expect(() => player.play("tap")).not.toThrow();
    expect(() => player.play("tap")).not.toThrow();
    await flush();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("logs a failed start without throwing", async () => {
    const { player, context, log } = setup();
    context.createBufferSource = () => ({
      buffer: null,
      connect: (node: unknown) => node,
      start: () => {
        throw new Error("InvalidStateError");
      },
    });
    await flush();

    player.play("tap");
    await flush();

    expect(log).toHaveBeenCalledWith(expect.stringContaining("tap"), expect.any(Error));
  });
});
