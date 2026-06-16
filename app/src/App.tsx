import { parseEther } from "ethers";
import { useState } from "react";

import {
  deepAudit,
  type DeepAuditReport,
  ecdsaSigner,
  type ExposureReport,
  ExposureScanner,
  mlDsa44Signer,
  pimlico,
  PQAccount,
  type SweepReport,
} from "quantum-migration";

import {
  buildAuditChains,
  connectWallet,
  randomSeed,
  readProvider,
  short,
  SUPPORTED_CHAINS,
  type Wallet,
} from "./lib.js";

const LEVEL_META: Record<string, { color: string; badge: string; label: string }> = {
  UNEXPOSED: { color: "#34d399", badge: "🟢", label: "Unexposed" },
  EXPOSED: { color: "#fbbf24", badge: "🟠", label: "Exposed" },
  HIGH_RISK: { color: "#f87171", badge: "🔴", label: "High risk" },
  CONTRACT: { color: "#9ca3af", badge: "⚪", label: "Contract" },
};

export function App() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState<string>("");

  // scan
  const [scanAddr, setScanAddr] = useState("");
  const [scanChain, setScanChain] = useState(421614);
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<ExposureReport | null>(null);

  // deep audit
  const [auditing, setAuditing] = useState(false);
  const [audit, setAudit] = useState<DeepAuditReport | null>(null);

  // migrate
  const [keys, setKeys] = useState<{ ecdsa: string; mldsa: string } | null>(null);
  const [newAddr, setNewAddr] = useState("");
  const [account, setAccount] = useState<PQAccount | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const [tokensInput, setTokensInput] = useState("");
  const [sweeping, setSweeping] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [sweepReport, setSweepReport] = useState<SweepReport | null>(null);

  // use (spend from) the PQ account
  const [bundlerUrl, setBundlerUrl] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sendAmt, setSendAmt] = useState("");
  const [usingAcct, setUsingAcct] = useState(false);

  const addLog = (m: string) => setLog((l) => [...l, m]);
  const wrap = (fn: () => Promise<void>) => async () => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onConnect = wrap(async () => {
    const w = await connectWallet();
    setWallet(w);
    setScanChain(w.chainId);
    if (!scanAddr) setScanAddr(w.address);
  });

  const onScan = wrap(async () => {
    if (!scanAddr) throw new Error("Enter an address to scan");
    setScanning(true);
    setReport(null);
    setAudit(null);
    try {
      const provider = wallet?.provider ?? readProvider(scanChain);
      const scanner = new ExposureScanner({ provider });
      setReport(await scanner.scan(scanAddr));
    } finally {
      setScanning(false);
    }
  });

  const onDeepAudit = wrap(async () => {
    if (!scanAddr) throw new Error("Scan an address first");
    setAuditing(true);
    setAudit(null);
    try {
      setAudit(await deepAudit(scanAddr, buildAuditChains()));
    } finally {
      setAuditing(false);
    }
  });

  const onGenerateKeys = wrap(async () => {
    if (!wallet) throw new Error("Connect a wallet first");
    if (!SUPPORTED_CHAINS[wallet.chainId])
      throw new Error("Switch to Sepolia or Arbitrum Sepolia");
    const ecdsa = randomSeed();
    const mldsa = randomSeed();
    setKeys({ ecdsa, mldsa });

    const acct = await PQAccount.create({
      preQuantum: ecdsaSigner({ privateKey: ecdsa }),
      postQuantum: mlDsa44Signer({ seed: mldsa }),
      provider: wallet.provider,
      bundler: pimlico(""), // not needed for deploy/sweep
    });
    setAccount(acct);
    setNewAddr(await acct.getAddress());
    setDeployed(await acct.isDeployed());
  });

  const onDeploy = wrap(async () => {
    if (!account || !wallet) throw new Error("Generate keys first");
    setDeploying(true);
    try {
      addLog("Deploying post-quantum account…");
      await account.deploy(wallet.signer);
      setDeployed(true);
      addLog(`✅ Account deployed at ${newAddr}`);
    } finally {
      setDeploying(false);
    }
  });

  const onSweep = wrap(async () => {
    if (!account || !wallet) throw new Error("Generate keys first");
    setSweeping(true);
    setSweepReport(null);
    try {
      const tokens = tokensInput
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter((t) => t.startsWith("0x"));
      addLog(`Sweeping ${tokens.length} token(s) + ETH → ${short(newAddr)}`);
      const rep = await account.sweepFrom(wallet.signer, {
        tokens,
        sweepEth: true,
        onProgress: addLog,
      });
      setSweepReport(rep);
      addLog("✅ Sweep complete");
    } finally {
      setSweeping(false);
    }
  });

  const onSendFromAccount = wrap(async () => {
    if (!keys || !wallet) throw new Error("Generate keys first");
    if (!bundlerUrl) throw new Error("Enter a Pimlico bundler URL");
    setUsingAcct(true);
    try {
      addLog("Building hybrid-signed UserOperation from the PQ account…");
      // The account is controlled by the two generated keys (NOT the wallet).
      const sender = await PQAccount.create({
        preQuantum: ecdsaSigner({ privateKey: keys.ecdsa }),
        postQuantum: mlDsa44Signer({ seed: keys.mldsa }),
        provider: wallet.provider,
        bundler: pimlico(bundlerUrl),
      });
      const hash = await sender.send({
        to: sendTo,
        value: parseEther(sendAmt || "0"),
      });
      addLog(`UserOp submitted: ${hash}`);
      addLog("Waiting for inclusion (ML-DSA verification is heavy)…");
      const receipt = await sender.waitForUserOp(hash);
      addLog(`✅ Included — tx ${short(receipt.receipt.transactionHash)}`);
    } finally {
      setUsingAcct(false);
    }
  });

  const m = report ? LEVEL_META[report.level]! : null;

  return (
    <div className="page">
      <header>
        <div className="brand">
          <span className="logo">⬡</span> Aegis-PQ
          <span className="tag">Quantum Migration</span>
        </div>
        {wallet ? (
          <div className="wallet">
            {SUPPORTED_CHAINS[wallet.chainId]?.name ?? `chain ${wallet.chainId}`} ·{" "}
            {short(wallet.address)}
          </div>
        ) : (
          <button onClick={onConnect}>Connect wallet</button>
        )}
      </header>

      {error && <div className="error">{error}</div>}

      <p className="lede">
        Every address that has <b>sent</b> a transaction has already published the public
        key a quantum computer needs to steal it. Scan an address, then migrate funds to a
        hybrid post-quantum account.
      </p>

      {/* ---- SCAN ---- */}
      <section className="card">
        <h2>1 · Scan for quantum exposure</h2>
        <div className="row">
          <input
            placeholder="0x address or ENS"
            value={scanAddr}
            onChange={(e) => setScanAddr(e.target.value)}
          />
          {!wallet && (
            <select
              value={scanChain}
              onChange={(e) => setScanChain(Number(e.target.value))}
            >
              {Object.entries(SUPPORTED_CHAINS).map(([id, c]) => (
                <option key={id} value={id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button onClick={onScan} disabled={scanning}>
            {scanning ? "Scanning…" : "Scan"}
          </button>
        </div>

        {report && m && (
          <div className="verdict" style={{ borderColor: m.color }}>
            <div className="verdict-head" style={{ color: m.color }}>
              {m.badge} {m.label} <span className="score">score {report.score}</span>
            </div>
            <div className="mono">{report.address}</div>
            {report.valueUsd !== undefined && (
              <div>Value at risk: ${report.valueUsd.toLocaleString()}</div>
            )}
            {report.publicKey && (
              <div className="mono small">
                pubkey {report.publicKey.slice(0, 36)}…
              </div>
            )}
            <p>{report.explanation}</p>
            {report.remediation && <p className="rem">→ {report.remediation}</p>}
            <button className="audit-btn" onClick={onDeepAudit} disabled={auditing}>
              {auditing ? "Auditing all chains…" : "🔬 Deep audit (multi-chain + cryptographic proof)"}
            </button>
          </div>
        )}

        {audit && (
          <div className="verdict" style={{ borderColor: "#7c9cff", marginTop: 12 }}>
            <div className="verdict-head" style={{ color: "#7c9cff" }}>
              🔬 Deep audit — {audit.exposed ? "EXPOSED" : "unexposed"} ·{" "}
              {audit.exposingTxCount} exposing txns
            </div>

            <table className="results">
              <tbody>
                {audit.chains.map((c) => (
                  <tr key={c.chain}>
                    <td>{c.chain}</td>
                    <td>
                      {c.error
                        ? "error"
                        : c.isContract
                          ? "contract"
                          : c.exposed
                            ? `🟠 exposed (${c.nonce})`
                            : "🟢 clean"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="proof">
              <div>
                Cryptographic proof ({audit.proof.signaturesAnalyzed} signatures):
              </div>
              <ul>
                <li>
                  all recover one key: {audit.proof.consistent ? "✅" : "❌"}
                </li>
                <li>
                  key hashes to address: {audit.proof.addressMatches ? "✅" : "❌"}
                </li>
                <li>
                  <b>{audit.proof.verified ? "✅ PROVEN exposed" : "not proven"}</b>
                </li>
              </ul>
              {audit.proof.publicKey && (
                <div className="mono small">key {audit.proof.publicKey.slice(0, 40)}…</div>
              )}
              {audit.nonceReuse.classicallyBroken && (
                <div className="warn">
                  🔴 ECDSA nonce reuse detected — private key recoverable TODAY (no
                  quantum needed). Move funds immediately.
                </div>
              )}
            </div>

            <div className="proof">
              <div>Exposure intelligence:</div>
              <ul>
                {audit.firstExposure && (
                  <li>
                    harvestable for <b>{Math.round(audit.firstExposure.ageDays)} days</b>{" "}
                    (since{" "}
                    {new Date(audit.firstExposure.timestamp * 1000)
                      .toISOString()
                      .slice(0, 10)}
                    , on {audit.firstExposure.chain})
                  </li>
                )}
                <li>
                  reused after exposure:{" "}
                  {audit.reusedAfterExposure ? "🟠 yes — still receiving" : "no"}
                </li>
                {audit.valueAtRisk.perChain.length > 0 && (
                  <li>
                    value at risk:{" "}
                    {audit.valueAtRisk.perChain
                      .map((v) => `${Number(v.balanceFormatted).toFixed(4)} ${v.symbol}`)
                      .join(" · ")}
                    {audit.valueAtRisk.totalUsd !== undefined
                      ? ` (~$${audit.valueAtRisk.totalUsd.toFixed(0)})`
                      : ""}
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* ---- MIGRATE ---- */}
      <section
        className={`card ${report?.level === "EXPOSED" || report?.level === "HIGH_RISK" ? "" : "dim"}`}
      >
        <h2>2 · Migrate to a post-quantum account</h2>

        {!wallet && <p className="hint">Connect a wallet to migrate.</p>}

        {wallet && (
          <>
            <button onClick={onGenerateKeys} disabled={!!keys}>
              {keys ? "Keys generated" : "Generate post-quantum keys"}
            </button>

            {keys && (
              <div className="keys">
                <div className="warn">
                  ⚠️ Save both keys — they control the new account. Never reuse on a public
                  site.
                </div>
                <label>ECDSA key</label>
                <div className="mono small">{keys.ecdsa}</div>
                <label>ML-DSA seed</label>
                <div className="mono small">{keys.mldsa}</div>
                <label>New account address (deterministic)</label>
                <div className="mono">{newAddr || "…"}</div>
                <div>Status: {deployed ? "✅ deployed" : "not deployed"}</div>
              </div>
            )}

            {keys && (
              <div className="row">
                <button onClick={onDeploy} disabled={deploying || deployed}>
                  {deploying ? "Deploying…" : deployed ? "Deployed" : "Deploy account"}
                </button>
              </div>
            )}

            {keys && deployed && (
              <div className="sweep">
                <label>ERC-20 token addresses to sweep (comma-separated, optional)</label>
                <input
                  placeholder="0xToken1, 0xToken2"
                  value={tokensInput}
                  onChange={(e) => setTokensInput(e.target.value)}
                />
                <button onClick={onSweep} disabled={sweeping}>
                  {sweeping ? "Sweeping…" : "Sweep funds → new account"}
                </button>
              </div>
            )}
          </>
        )}

        {log.length > 0 && (
          <pre className="log">{log.join("\n")}</pre>
        )}

        {sweepReport && (
          <table className="results">
            <tbody>
              {sweepReport.results.map((r, i) => (
                <tr key={i}>
                  <td>{r.type === "eth" ? "ETH" : `ERC-20 ${short(r.token!)}`}</td>
                  <td>{r.skipped ? "skipped" : r.success ? "✅ swept" : "❌ failed"}</td>
                  <td className="mono small">
                    {r.txHash ? short(r.txHash) : r.error ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ---- USE THE PQ ACCOUNT ---- */}
      <section className={`card ${keys && deployed ? "" : "dim"}`}>
        <h2>3 · Use your post-quantum account</h2>
        <p className="hint">
          The account is controlled by the <b>two keys above</b> — not your wallet (it
          can't produce the raw ECDSA + ML-DSA signatures the account requires). To spend,
          the SDK builds a UserOperation and signs it with both keys, then submits it via a
          bundler. The account needs ETH for gas (sweep some in first).
        </p>
        {keys && deployed && (
          <>
            <label className="hint">Pimlico bundler URL</label>
            <input
              placeholder="https://api.pimlico.io/v2/<chainId>/rpc?apikey=…"
              value={bundlerUrl}
              onChange={(e) => setBundlerUrl(e.target.value)}
            />
            <div className="row" style={{ marginTop: 8 }}>
              <input
                placeholder="recipient 0x…"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
              />
              <input
                placeholder="ETH amount"
                value={sendAmt}
                onChange={(e) => setSendAmt(e.target.value)}
                style={{ minWidth: 110 }}
              />
              <button onClick={onSendFromAccount} disabled={usingAcct}>
                {usingAcct ? "Signing + sending…" : "Send (hybrid-signed)"}
              </button>
            </div>
          </>
        )}
      </section>

      <footer>
        Built on the hybrid post-quantum ERC-4337 account · ECDSA ∧ ML-DSA-44 · testnet
        only
      </footer>
    </div>
  );
}
