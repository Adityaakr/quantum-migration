import { parseEther } from "ethers";
import { type ReactNode, useState } from "react";

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
  addressUrl,
  buildAuditChains,
  CHAIN_NAME,
  connectWallet,
  randomSeed,
  readProvider,
  short,
  SUPPORTED_CHAINS,
  txUrl,
  type Wallet,
} from "./lib.js";
import { type CardData } from "./shareCanvas.js";
import { ShareCard } from "./ShareCard.js";

type TagVariant = "orange" | "green" | "blue" | "violet" | "gray" | "red";

const LEVEL_META: Record<string, { tag: TagVariant; label: string }> = {
  UNEXPOSED: { tag: "green", label: "Unexposed" },
  EXPOSED: { tag: "orange", label: "Exposed" },
  HIGH_RISK: { tag: "red", label: "High risk" },
  CONTRACT: { tag: "gray", label: "Contract" },
};

const Tag = ({ variant, children }: { variant: TagVariant; children: ReactNode }) => (
  <span className={`tag ${variant}`}>{children}</span>
);

const Stat = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="stat">
    <div className="k">{k}</div>
    <div className="v">{children}</div>
  </div>
);

const ExtLink = ({
  href,
  className,
  children,
}: {
  href?: string;
  className?: string;
  children: ReactNode;
}) =>
  href ? (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );

const Check = ({
  ok,
  strong,
  children,
}: {
  ok: boolean;
  strong?: boolean;
  children: ReactNode;
}) => (
  <div className={`check ${ok ? "ok" : "no"}${strong ? " strong" : ""}`}>
    <span className="check-i">{ok ? "✓" : "✕"}</span>
    <span>{children}</span>
  </div>
);

const KV = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="kv-row">
    <span className="kv-k">{k}</span>
    <span className="kv-v">{children}</span>
  </div>
);

export function App() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState("");

  // scan
  const [scanAddr, setScanAddr] = useState("");
  const [scanChain, setScanChain] = useState(421614);
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<ExposureReport | null>(null);

  // deep audit
  const [auditing, setAuditing] = useState(false);
  const [audit, setAudit] = useState<DeepAuditReport | null>(null);
  const [auditLog, setAuditLog] = useState<string[]>([]);

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

  // use account
  const [bundlerUrl, setBundlerUrl] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sendAmt, setSendAmt] = useState("");
  const [usingAcct, setUsingAcct] = useState(false);

  const [copied, setCopied] = useState("");
  const copy = (text: string, id: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 1200);
  };

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
      setReport(await new ExposureScanner({ provider }).scan(scanAddr));
    } finally {
      setScanning(false);
    }
  });

  const onDeepAudit = wrap(async () => {
    if (!scanAddr) throw new Error("Scan an address first");
    setAuditing(true);
    setAudit(null);
    setAuditLog([]);
    try {
      const result = await deepAudit(scanAddr, buildAuditChains(), {
        onProgress: (m) => setAuditLog((l) => [...l, m]),
      });
      setAudit(result);
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
      bundler: pimlico(""),
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
      addLog(`✅ Included · tx ${short(receipt.receipt.transactionHash)}`);
    } finally {
      setUsingAcct(false);
    }
  });

  const meta = report ? LEVEL_META[report.level]! : null;
  const exposed = report?.level === "EXPOSED" || report?.level === "HIGH_RISK";
  const canMigrate = wallet && exposed;
  const scanChainName = wallet ? CHAIN_NAME[wallet.chainId] : CHAIN_NAME[scanChain];
  const walletChainName = wallet ? CHAIN_NAME[wallet.chainId] : undefined;
  const exposedChains = audit?.chains.filter((c) => c.exposed).length ?? 0;
  const valueAtRisk = audit?.valueAtRisk.perChain
    .map((v) => `${Number(v.balanceFormatted).toFixed(3)} ${v.symbol}`)
    .join(" + ");

  // ---- shareable card data ----
  const topValue = audit
    ? [...audit.valueAtRisk.perChain].sort(
        (a, b) => Number(b.balanceFormatted) - Number(a.balanceFormatted),
      )[0]
    : undefined;
  const cardAccent = exposed
    ? "#FF5500"
    : report?.level === "UNEXPOSED"
      ? "#36C46A"
      : "#066EFF";
  const exposedOn = audit
    ? audit.chains
        .filter((c) => c.exposed)
        .map((c) => c.chain)
        .join(", ")
    : undefined;
  const cardData: CardData | null = report
    ? {
        address: report.address,
        eyebrow: exposed
          ? "Quantum exposure detected"
          : report.level === "UNEXPOSED"
            ? "No quantum exposure"
            : "Smart contract",
        verdict: exposed
          ? "Quantum Exposed"
          : report.level === "UNEXPOSED"
            ? "Quantum Safe"
            : "Smart Contract",
        accent: cardAccent,
        exposedOn: exposedOn || undefined,
        stats: audit
          ? [
              { label: "Risk", value: `${report.score}/100`, color: cardAccent },
              {
                label: "Chains exposed",
                value: `${exposedChains}/${audit.chains.length}`,
              },
              { label: "Txns leaked", value: `${audit.exposingTxCount}` },
              ...(topValue
                ? [
                    {
                      label: "Value at risk",
                      value: `${Number(topValue.balanceFormatted).toFixed(3)} ${topValue.symbol}`,
                      color: cardAccent,
                    },
                  ]
                : []),
              ...(audit.firstExposure
                ? [
                    {
                      label: "Exposed",
                      value: `${Math.round(audit.firstExposure.ageDays)}d`,
                    },
                  ]
                : []),
            ]
          : [
              { label: "Status", value: meta?.label ?? "" },
              { label: "Risk", value: `${report.score}/100`, color: cardAccent },
            ],
        proof:
          audit && audit.proof.publicKey
            ? {
                verified: audit.proof.verified,
                line: `${audit.proof.signaturesAnalyzed} signatures recovered, key binds to this address`,
                key: audit.proof.publicKey,
              }
            : undefined,
        cta: exposed
          ? "Is your wallet quantum-safe? Scan free at"
          : "Check your wallet's quantum exposure at",
      }
    : null;
  const cardSummary = report
    ? `My wallet ${short(report.address)} is ${
        exposed
          ? "quantum-exposed"
          : report.level === "UNEXPOSED"
            ? "quantum-safe"
            : "a contract"
      }.${
        audit
          ? ` ${exposedChains} chain(s) exposed${
              topValue
                ? `, ${Number(topValue.balanceFormatted).toFixed(3)} ${topValue.symbol} at risk`
                : ""
            }.`
          : ""
      } Checked with Lattice, post-quantum wallet safety.`
    : "";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">▦</span> Lattice
        </div>
        {wallet ? (
          <span className="net-tag">
            {SUPPORTED_CHAINS[wallet.chainId]?.name ?? `chain ${wallet.chainId}`} ·{" "}
            {short(wallet.address)}
          </span>
        ) : (
          <button className="btn ghost" onClick={onConnect}>
            Connect wallet
          </button>
        )}
      </header>

      <section className="hero surface-dark">
        <div className="hero-inner">
          <h1>
            Post-quantum
            <br />
            wallet safety
          </h1>
          <p>
            Every address that has <b>sent</b> a transaction has published the public key
            a quantum computer needs to derive its private key. Scan it, prove the
            exposure, and migrate to a hybrid post-quantum account.
          </p>
          <div className="scanbar">
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
            <button className="btn primary" onClick={onScan} disabled={scanning}>
              {scanning ? "Scanning…" : "Scan"}
            </button>
          </div>
        </div>
      </section>

      <main className="container">
        {error && <div className="banner error">{error}</div>}

        {report && meta && (
          <div className="stats">
            <Stat k="Status">
              <Tag variant={meta.tag}>{meta.label}</Tag>
            </Stat>
            <Stat k="Risk score">{report.score}</Stat>
            <Stat k="Chains exposed">{audit ? exposedChains : "-"}</Stat>
            <Stat k="Value at risk">{valueAtRisk || "-"}</Stat>
            <Stat k="Harvestable">
              {audit?.firstExposure
                ? `${Math.round(audit.firstExposure.ageDays)}d`
                : "-"}
            </Stat>
          </div>
        )}

        <div className="panel-grid">
          {/* ---- Exposure ---- */}
          <section className="panel span2">
            <div className="panel-head">
              <h2>
                <span className="step">1</span>Exposure
              </h2>
              {meta && <Tag variant={meta.tag}>{meta.label}</Tag>}
            </div>

            {!report && (
              <p className="muted">
                Enter an address above and hit <b>Scan</b> to check whether its public key
                is already published on-chain.
              </p>
            )}

            {report && meta && (
              <div className="verdict">
                <ExtLink
                  className="addr link"
                  href={addressUrl(scanChainName, report.address)}
                >
                  {report.address} ↗
                </ExtLink>
                {report.publicKey && (
                  <div className="addr">pubkey {report.publicKey.slice(0, 36)}…</div>
                )}
                <p>{report.explanation}</p>
                {report.remediation && <p className="rem">→ {report.remediation}</p>}
                {exposed && (
                  <div className="row">
                    <button
                      className="btn outline"
                      onClick={onDeepAudit}
                      disabled={auditing}
                    >
                      {auditing ? "Auditing all chains…" : "Run deep audit"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ---- Deep audit ---- */}
          <section className={`panel span2 ${audit || auditing ? "" : "dim"}`}>
            <div className="panel-head">
              <h2>
                <span className="step">2</span>Deep audit
              </h2>
              {audit && (
                <Tag variant={audit.exposed ? "orange" : "green"}>
                  {audit.exposed ? `${exposedChains} chain(s) exposed` : "clean"}
                </Tag>
              )}
            </div>

            {!audit && !auditing && auditLog.length === 0 && (
              <p className="muted">
                Multi-chain scan + cryptographic proof (key recovery & address binding) +
                ECDSA nonce-reuse + harvest-age + value-at-risk. Run it from the Exposure
                panel above.
              </p>
            )}

            {/* live trace */}
            {auditLog.length > 0 && (
              <div className="trace">
                <div className="trace-head">
                  {auditing ? (
                    <>
                      <span className="spinner" /> running live…
                    </>
                  ) : (
                    "trace"
                  )}
                </div>
                <pre className="log">{auditLog.join("\n")}</pre>
              </div>
            )}

            {audit && (
              <div className="findings">
                <div className="find-block">
                  <div className="find-h">Per-chain exposure</div>
                  <table className="data grid-table">
                    <thead>
                      <tr>
                        <th>Chain</th>
                        <th>Balance</th>
                        <th>First exposed</th>
                        <th style={{ textAlign: "right" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.chains.map((c) => (
                        <tr key={c.chain}>
                          <td>
                            <ExtLink
                              className="link"
                              href={addressUrl(c.chain, audit.address)}
                            >
                              {c.chain}
                            </ExtLink>
                          </td>
                          <td className="mono num">
                            {Number(c.balanceFormatted).toFixed(4)} {c.nativeSymbol}
                          </td>
                          <td className="num muted-cell">
