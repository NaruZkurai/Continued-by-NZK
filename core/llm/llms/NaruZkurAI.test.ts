import NaruZkurAI from "./NaruZkurAI";

describe("NaruZkurAI", () => {
  test("should identify correct o-series models", () => {
    const naruzkurai = new NaruZkurAI({
      model: "o3-mini",
    });
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("o4-mini")).toBeTruthy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("o3-mini")).toBeTruthy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("o1-mini")).toBeTruthy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("o1")).toBeTruthy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("o3")).toBeTruthy();

    // artificially correct samples for future models
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("o5-mini")).toBeTruthy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("o6")).toBeTruthy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("o77")).toBeTruthy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("o54-mini")).toBeTruthy();

    // gpt-5+ models
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("gpt-5")).toBeTruthy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("gpt-5.4")).toBeTruthy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("gpt-5.4-mini")).toBeTruthy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("gpt-5.4-pro")).toBeTruthy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("gpt-6")).toBeTruthy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("gpt-7-turbo")).toBeTruthy();
  });
  test("should identify incorrect o-series models", () => {
    const naruzkurai = new NaruZkurAI({
      model: "o3-mini",
    });
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("gpt-o4-mini")).toBeFalsy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("gpt-4.5")).toBeFalsy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("gpt-4.1")).toBeFalsy();

    // artificially wrong samples
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("os1")).toBeFalsy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("so1")).toBeFalsy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("ao31")).toBeFalsy();
    expect(naruzkurai.isOSeriesOrGpt5PlusModel("1os")).toBeFalsy();
  });
});
