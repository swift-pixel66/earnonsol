// Inject live pool stats (APR / liquidity / 24h fees) into the static landing.
// The mainnet reference pools are Raydium CLMM accounts, so stats come from the
// Raydium public API. The DOM/markup is unchanged — only the values update.
(function () {
  var POOLS = {
    nvda: "49iMatQtoyabsYAQc8GafVq6aeBFVDxSRH44oiatyyw6",
    tsla: "8aDaBQkTrS6HVMjyc6EZebgdiaXhLYGriDWKWWp1NpFF",
    aapl: "CKwJZwm7oj3nu4653N1EpDrqXbXAYXoPFiPeEnLouF8y",
    spy: "6truu3rZuiB9rKQg4VYC3Dt3QwV7DgwGqXrYUcrvnDDE",
    qqq: "GMjGLWzvK75LPetrgAmdeXnvxc4fUuQPwJxeQqTDU1aG",
    stonk: "G4G5SzkbLFMhoSgHiQNeyJFt75sSDsL1rD8LVyT5xZbU",
  };
  function usd(n) {
    if (n == null) return "—";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(2) + "K";
    return "$" + n.toFixed(0);
  }
  function setAPR(id, apr) {
    var el = document.querySelector(".home-vault-" + id + " .home-apr strong");
    if (el) el.innerHTML = apr.toFixed(2) + "<small>%</small>";
  }
  function setStats(id, tvl, fees) {
    var dds = document.querySelectorAll(".home-vault-" + id + " .home-vault-stats dd");
    if (dds[0]) dds[0].textContent = usd(tvl);
    if (dds[1]) dds[1].textContent = usd(fees);
  }
  function setMetrics(tvl, fees) {
    var m = document.querySelectorAll(".home-metrics > div strong");
    // [0]=Live vaults, [1]=Tracked pool liquidity, [2]=24h pool fees
    if (m[1]) { m[1].textContent = usd(tvl); m[1].setAttribute("aria-busy", "false"); }
    if (m[2]) { m[2].textContent = usd(fees); m[2].setAttribute("aria-busy", "false"); }
  }
  var ids = Object.keys(POOLS);
  var url = "https://api-v3.raydium.io/pools/info/ids?ids=" + ids.map(function (i) { return POOLS[i]; }).join(",");
  fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var byPool = {};
      (j.data || []).forEach(function (p) { if (p) byPool[p.id] = p; });
      var totalTvl = 0, totalFees = 0;
      ids.forEach(function (id) {
        var p = byPool[POOLS[id]];
        if (!p) return;
        var apr = Number(p.day && p.day.apr) || 0;
        var tvl = Number(p.tvl) || 0;
        var fees = Number(p.day && p.day.volumeFee) || 0;
        setAPR(id, apr);
        setStats(id, tvl, fees);
        totalTvl += tvl;
        totalFees += fees;
      });
      setMetrics(totalTvl, totalFees);
    })
    .catch(function () { /* keep static values on failure */ });
})();
