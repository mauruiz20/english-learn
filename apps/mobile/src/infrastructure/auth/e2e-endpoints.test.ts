import { e2eEndpoints } from "./e2e-endpoints";

function storage(items: Record<string, string>) {
  return { getItem: (key: string) => items[key] ?? null };
}

describe("e2eEndpoints", () => {
  it("reads the fake API and Google endpoints a spec stored", () => {
    expect(
      e2eEndpoints(
        storage({
          "english-learn.e2e.apiBaseUrl": "http://localhost:5001",
          "english-learn.e2e.googleAuthUrl": "http://localhost:5001/google/auth",
        }),
      ),
    ).toEqual({
      apiBaseUrl: "http://localhost:5001",
      googleAuthUrl: "http://localhost:5001/google/auth",
    });
  });

  it("reads the old and new web addresses a transfer spec stored", () => {
    expect(
      e2eEndpoints(
        storage({
          "english-learn.e2e.oldWebOrigin": "http://localhost:4174",
          "english-learn.e2e.newWebOrigin": "http://localhost:4173",
        }),
      ),
    ).toEqual({ oldWebOrigin: "http://localhost:4174", newWebOrigin: "http://localhost:4173" });
  });

  it("is empty when nothing is stored or storage is missing", () => {
    expect(e2eEndpoints(storage({}))).toEqual({});
    expect(e2eEndpoints(undefined)).toEqual({});
  });
});
