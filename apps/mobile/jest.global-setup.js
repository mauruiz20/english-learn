// Runs once, before Jest starts its workers (which inherit this environment).
// Tests run in a fixed timezone west of UTC (UTC-6, no DST since 2022) so date code that
// wrongly uses UTC fails everywhere, including on UTC CI machines.
module.exports = () => {
  process.env.TZ = "America/Mexico_City";
};
