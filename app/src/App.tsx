import { parseEther } from "ethers";
import { type ReactNode, useState } from "react";

import {
  type ChainExposure,
  deepAudit,
  type DeepAuditReport,
  ecdsaSigner,
  type ExposureReport,
  ExposureScanner,
  mlDsa44Signer,
  pimlico,
  PQAccount,
  scanMultiChain,
  type SweepReport,
} from "quantum-migration";

import {
  addressUrl,
  buildAuditChains,
  CHAIN_NAME,
  connectWallet,
  randomSeed,
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

/**
 * Renders a secret key privately: the real value is NEVER in the DOM by default
 * (a masked placeholder is shown). It lives only in memory and is exposed via the
 * Copy button, or temporarily via Reveal. Safe against screenshots / screen-share.
 */
function KeyField({
  label,
  value,
  id,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  id: string;
  copied: string;
  onCopy: (text: string, id: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const masked = `${value.slice(0, 6)}${"•".repeat(26)}${value.slice(-4)}`;
  return (
    <>
      <label className="field">{label}</label>
      <div className="copyrow">
        <span className={`mono keyval-text${revealed ? "" : " masked"}`}>
          {revealed ? value : masked}
        </span>
        <button className="copybtn" onClick={() => setRevealed((r) => !r)}>
          {revealed ? "Hide" : "Reveal"}
        </button>
        <button className="copybtn" onClick={() => onCopy(value, id)}>
          {copied === id ? "✓ copied" : "Copy"}
        </button>
      </div>
    </>
  );
}

export function App() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState("");

  // scan
  const [scanAddr, setScanAddr] = useState("");
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<ExposureReport | null>(null);
  const [scanChains, setScanChains] = useState<ChainExposure[] | null>(null);

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
    if (!scanAddr) setScanAddr(w.address);
  });

  const runDeepAudit = async (address: string) => {
    setAuditing(true);
    setAudit(null);
    setAuditLog([]);
    try {
      const result = await deepAudit(address, buildAuditChains(), {
        onProgress: (m) => setAuditLog((l) => [...l, m]),
      });
      setAudit(result);
    } finally {
      setAuditing(false);
    }
  };

  // Scan works WITHOUT a wallet: a fast multi-chain verdict, then the deep audit
  // (cryptographic proof + key recovery) kicks off automatically when exposed.
  const onScan = wrap(async () => {
    const input = scanAddr.trim();
    if (!input) throw new Error("Enter an address or ENS name to scan");
    setScanning(true);
    setReport(null);
    setAudit(null);
    setAuditLog([]);
    setScanChains(null);

    let address = input;
    let anyExposed = false;
    try {
      const chains = buildAuditChains();
      // resolve ENS / validate via the Ethereum provider (ENS lives on mainnet)
      address = await new ExposureScanner({
        provider: chains[0]!.provider,
      }).resolve(input);

      const results = await scanMultiChain(address, chains);
      setScanChains(results);

      const exposedList = results.filter((c) => c.exposed);
      anyExposed = exposedList.length > 0;
      const contractOnly =
        exposedList.length === 0 && results.some((c) => c.isContract);
      const level = anyExposed
        ? "EXPOSED"
        : contractOnly
          ? "CONTRACT"
          : "UNEXPOSED";

      setReport({
        address,
        level,
        isContract: contractOnly,
        isDelegated: false,
        nonce: results.reduce((m, c) => Math.max(m, c.nonce), 0),
        score: anyExposed ? 50 : 0,
        explanation: anyExposed
          ? `This address has sent transactions on ${exposedList
              .map((c) => c.chain)
              .join(
                ", ",
              )}, which published its secp256k1 public key on-chain. A quantum computer running Shor's algorithm could derive the private key from it.`
          : contractOnly
            ? "This is a smart contract on the scanned chains. It has no single secp256k1 key; the quantum surface is its owner / signer EOAs."
            : "This address has never sent a transaction on any scanned chain, so only the hash of its public key is on-chain. It is quantum-safe until its first outgoing transaction.",
        remediation: anyExposed
          ? "Migrate funds to a fresh hybrid post-quantum account and retire this address."
          : undefined,
      });
    } finally {
      setScanning(false);
    }

    // Automatically run the full proof when the address is exposed.
    if (anyExposed) await runDeepAudit(address);
  });

  const onDeepAudit = wrap(async () => {
    const address = report?.address ?? scanAddr.trim();
    if (!address) throw new Error("Scan an address first");
    await runDeepAudit(address);
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
  const walletChainName = wallet ? CHAIN_NAME[wallet.chainId] : undefined;
  // chain breakdown comes from the deep audit if run, else the quick multi-chain scan
  const resultChains = audit?.chains ?? scanChains ?? [];
  const exposedChainList = resultChains.filter((c) => c.exposed);
  const exposedChains = exposedChainList.length;
  const primaryChain = exposedChainList[0]?.chain ?? "Ethereum";
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
  const exposedOn = exposedChainList.length
    ? exposedChainList.map((c) => c.chain).join(", ")
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
        site: "quantum.adibuilds.in",
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
      } Check yours at quantum.adibuilds.in`
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
              placeholder="Paste any address or ENS, no wallet needed"
              value={scanAddr}
              onChange={(e) => setScanAddr(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onScan();
              }}
            />
            <button className="btn primary" onClick={onScan} disabled={scanning}>
              {scanning ? "Scanning all chains…" : "Scan"}
            </button>
          </div>
          <p className="scanhint">
            Checks 15 chains at once. Connecting a wallet is only needed to migrate.
          </p>
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
            <Stat k="Chains exposed">
              {resultChains.length ? `${exposedChains}/${resultChains.length}` : "-"}
            </Stat>
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
                  href={addressUrl(primaryChain, report.address)}
                >
                  {report.address} ↗
                </ExtLink>
                {exposedChainList.length > 0 && (
                  <div className="chiprow">
                    {exposedChainList.map((c) => (
                      <ExtLink
                        key={c.chain}
                        className="tag orange"
                        href={addressUrl(c.chain, report.address)}
                      >
                        {c.chain} · {c.nonce}
                      </ExtLink>
                    ))}
                  </div>
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
                      {auditing
                        ? "Auditing all chains…"
                        : audit
                          ? "Re-run deep audit"
                          : "Run deep audit"}
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
                            {c.firstExposureTimestamp
                              ? new Date(c.firstExposureTimestamp * 1000)
                                  .toISOString()
                                  .slice(0, 10)
                              : "-"}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {c.error ? (
                              <Tag variant="gray">error</Tag>
                            ) : c.isContract ? (
                              <Tag variant="gray">contract</Tag>
                            ) : c.exposed ? (
                              <Tag variant="orange">exposed · {c.nonce}</Tag>
                            ) : (
                              <Tag variant="green">clean</Tag>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="find-block">
                  <div className="find-h">
                    Cryptographic proof
                    {audit.proof.verified && <Tag variant="green">Proven</Tag>}
                  </div>
                  <div className="checklist">
                    <Check ok={audit.proof.signaturesAnalyzed > 0}>
                      {audit.proof.signaturesAnalyzed} signatures recovered from on-chain
                      transactions
                    </Check>
                    <Check ok={audit.proof.consistent}>
                      Every signature recovers one identical public key
                    </Check>
                    <Check ok={audit.proof.addressMatches}>
                      That key hashes (keccak256) to this exact address
                    </Check>
                    <Check ok={audit.proof.verified} strong>
                      {audit.proof.verified
                        ? "Proven. This key provably controls the address"
                        : "Not proven"}
                    </Check>
                  </div>
                </div>

                {audit.proof.publicKey && (
                  <div className="find-block">
                    <div className="find-h">Recovered public key · the quantum target</div>
                    <div className="copyrow keyval">
                      <span className="mono">{audit.proof.publicKey}</span>
                      <button
                        className="copybtn"
                        onClick={() => copy(audit.proof.publicKey!, "pk")}
                      >
                        {copied === "pk" ? "✓ copied" : "copy"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="find-block">
                  <div className="find-h">Exposure intelligence</div>
                  <div className="kv">
                    <KV k="Transactions that leaked the key">
                      <b>{audit.exposingTxCount}</b>
                    </KV>
                    {audit.firstExposure && (
                      <KV k="Harvestable for">
                        <b>{Math.round(audit.firstExposure.ageDays)} days</b> · since{" "}
                        {new Date(audit.firstExposure.timestamp * 1000)
                          .toISOString()
                          .slice(0, 10)}
                      </KV>
                    )}
                    <KV k="Reused after exposure">
                      {audit.reusedAfterExposure ? (
                        <Tag variant="orange">still receiving</Tag>
                      ) : (
                        <Tag variant="green">no</Tag>
                      )}
                    </KV>
                    {valueAtRisk && <KV k="Value at risk">{valueAtRisk}</KV>}
                    <KV k="ECDSA nonce reuse">
                      {audit.nonceReuse.classicallyBroken ? (
                        <Tag variant="red">key recoverable today</Tag>
                      ) : audit.nonceReuse.reused ? (
                        <Tag variant="gray">repeated r · no break</Tag>
                      ) : (
                        <Tag variant="green">none</Tag>
                      )}
                    </KV>
                  </div>
                </div>

                {audit.analyzedTransactions.length > 0 && (
                  <div className="find-block">
                    <div className="find-h">
                      Evidence · {audit.analyzedTransactions.length} transactions analyzed
                    </div>
                    <div className="tx-list">
                      {audit.analyzedTransactions.map((t, i) => (
                        <ExtLink
                          key={i}
                          className="tx-chip"
                          href={txUrl(t.chain, t.txHash)}
                        >
                          {t.chain} · {short(t.txHash)} ↗
                        </ExtLink>
                      ))}
                    </div>
                  </div>
                )}

                {audit.nonceReuse.classicallyBroken && (
                  <p className="warn">
                    🔴 ECDSA nonce reuse: private key recoverable TODAY (no quantum
                    needed). Move funds immediately.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* ---- Share ---- */}
          {cardData && (
            <section className="panel span2">
              <div className="panel-head">
                <h2>Share your result</h2>
                <Tag variant={exposed ? "orange" : "green"}>
                  {exposed ? "Spread the word" : "Looking good"}
                </Tag>
              </div>
              <p className="hint">
                A clean, branded card you can post anywhere. Download the PNG or share
                straight to X.
              </p>
              <ShareCard data={cardData} summary={cardSummary} />
            </section>
          )}

          {/* ---- Migrate ---- */}
          <section className={`panel span2 ${canMigrate ? "" : "dim"}`}>
            <div className="panel-head">
              <h2>
                <span className="step">3</span>Migrate to a post-quantum account
              </h2>
              {deployed && <Tag variant="green">deployed</Tag>}
            </div>

            {!wallet && <p className="hint">Connect a wallet to migrate.</p>}

            {wallet && (
              <>
                <div className="row">
                  <button
                    className="btn primary"
                    onClick={onGenerateKeys}
                    disabled={!!keys}
                  >
                    {keys ? "Keys generated" : "Generate post-quantum keys"}
                  </button>
                  {keys && (
                    <button
                      className="btn outline"
                      onClick={onDeploy}
                      disabled={deploying || deployed}
                    >
                      {deploying ? "Deploying…" : deployed ? "Deployed" : "Deploy account"}
                    </button>
                  )}
                </div>

                {keys && (
                  <div className="keybox">
                    <div className="warn">
                      ⚠️ Save both keys. They control the new account. Never reuse on a
                      public site.
                    </div>
                    <KeyField
                      label="ECDSA key"
                      value={keys.ecdsa}
                      id="ec"
                      copied={copied}
                      onCopy={copy}
                    />
                    <KeyField
                      label="ML-DSA seed"
                      value={keys.mldsa}
                      id="ml"
                      copied={copied}
                      onCopy={copy}
                    />
                    <label className="field">New account address</label>
                    <div className="copyrow">
                      <ExtLink
                        className="mono link"
                        href={newAddr ? addressUrl(walletChainName, newAddr) : undefined}
                      >
                        {newAddr ? `${newAddr} ↗` : "…"}
                      </ExtLink>
                      {newAddr && (
                        <button className="copybtn" onClick={() => copy(newAddr, "na")}>
                          {copied === "na" ? "✓ copied" : "copy"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {keys && deployed && (
                  <>
                    <label className="field">
                      ERC-20 token addresses to sweep (comma-separated, optional)
                    </label>
                    <div className="row" style={{ marginTop: 0 }}>
                      <input
                        placeholder="0xToken1, 0xToken2"
                        value={tokensInput}
                        onChange={(e) => setTokensInput(e.target.value)}
                      />
                      <button
                        className="btn primary"
                        onClick={onSweep}
                        disabled={sweeping}
                      >
                        {sweeping ? "Sweeping…" : "Sweep funds"}
                      </button>
                    </div>
                  </>
                )}

                {log.length > 0 && <pre className="log">{log.join("\n")}</pre>}

                {sweepReport && (
                  <table className="data">
                    <tbody>
                      {sweepReport.results.map((r, i) => (
                        <tr key={i}>
                          <td>{r.type === "eth" ? "ETH" : `ERC-20 ${short(r.token!)}`}</td>
                          <td style={{ textAlign: "right" }}>
                            {r.skipped ? (
                              <Tag variant="gray">skipped</Tag>
                            ) : r.success ? (
                              <Tag variant="green">swept</Tag>
                            ) : (
                              <Tag variant="red">failed</Tag>
                            )}
                          </td>
                          <td className="mono" style={{ fontSize: 12 }}>
                            {r.txHash ? (
                              <ExtLink
                                className="link"
                                href={txUrl(walletChainName, r.txHash)}
                              >
                                {short(r.txHash)} ↗
                              </ExtLink>
                            ) : (
                              r.error ?? ""
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </section>

          {/* ---- Use account ---- */}
          <section className={`panel span2 ${keys && deployed ? "" : "dim"}`}>
            <div className="panel-head">
              <h2>
                <span className="step">4</span>Use your post-quantum account
              </h2>
            </div>
            <p className="hint">
              The account is controlled by the <b>two keys above</b>, not your wallet. It
              can't produce the raw ECDSA + ML-DSA signatures the account requires. The SDK
              builds a UserOperation, hybrid-signs it, and submits via a bundler. The
              account needs ETH for gas.
            </p>
            {keys && deployed && (
              <>
                <label className="field">Pimlico bundler URL</label>
                <input
                  placeholder="https://api.pimlico.io/v2/<chainId>/rpc?apikey=…"
                  value={bundlerUrl}
                  onChange={(e) => setBundlerUrl(e.target.value)}
                />
                <div className="row">
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
                  <button
                    className="btn primary"
                    onClick={onSendFromAccount}
                    disabled={usingAcct}
                  >
                    {usingAcct ? "Signing + sending…" : "Send (hybrid-signed)"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      <footer>
        Lattice · hybrid post-quantum ERC-4337 account · ECDSA ∧ ML-DSA-44 · testnet only
      </footer>
    </div>
  );
}
