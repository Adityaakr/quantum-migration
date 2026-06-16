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
