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
