"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Box, Button, Chip, CircularProgress, Container, Divider, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import { Connection } from "@solana/web3.js";
import { parseStatusSelection, publicRpcEndpoint, publicStatusPath, readPublicStatus, type PublicCluster, type PublicStatus, type StatusSelection } from "../lib/public-status";

type View = { key: string; state: "loading" | "ready" | "error"; result?: PublicStatus; message?: string; fetchedAt?: string };
const labels = { "mainnet-beta": "Mainnet Beta", devnet: "Devnet", testnet: "Testnet" };
const titles = { "recorded-pass": "Access check passed", "recorded-fail": "Access check did not pass", "no-record": "No stored access check", "gate-missing": "Gate not found" };

export default function PublicStatusPage() {
  const params = useSearchParams();
  const router = useRouter();
  const key = params.toString();
  const [gateId, setGateId] = useState("");
  const [wallet, setWallet] = useState("");
  const [cluster, setCluster] = useState<PublicCluster>("mainnet-beta");
  const [view, setView] = useState<View>();
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  let selection: StatusSelection | undefined;
  let inputError = "";
  const hasQuery = Boolean(params.get("gateId") || params.get("wallet") || params.get("cluster"));
  if (hasQuery) {
    try { selection = parseStatusSelection(new URLSearchParams(key)); }
    catch (error) { inputError = error instanceof Error ? error.message : "Invalid status link."; }
  }
  useEffect(() => {
    setGateId(params.get("gateId") ?? "");
    setWallet(params.get("wallet") ?? "");
    const requested = params.get("cluster");
    setCluster(requested === "devnet" || requested === "testnet" ? requested : "mainnet-beta");
    setNotice("");
  }, [key]);
  useEffect(() => {
    const request = ++generation.current;
    if (!hasQuery || inputError) { setView(undefined); return; }
    const target = parseStatusSelection(new URLSearchParams(key));
    setView({ key, state: "loading" });
    const connection = new Connection(publicRpcEndpoint(target.cluster), "confirmed");
    void readPublicStatus(connection, target).then(result => {
      if (generation.current === request) setView({ key, state: "ready", result, fetchedAt: new Date().toISOString() });
    }).catch(error => {
      if (generation.current === request) setView({ key, state: "error", message: error instanceof Error ? error.message : "RPC lookup failed. Retry shortly." });
    });
    return () => { generation.current += 1; };
  }, [key, refresh, hasQuery, inputError]);
  const current = view?.key === key ? view : undefined;
  const result = current?.result;
  const canonicalPath = selection ? publicStatusPath(selection) : "";
  const memberPath = selection ? `/access?${new URLSearchParams({ gateId: selection.gateId, cluster: selection.cluster })}` : "/access";
  const explorer = (address: string) => `https://explorer.solana.com/address/${address}${selection?.cluster === "mainnet-beta" ? "" : `?cluster=${selection?.cluster}`}`;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      const next = publicStatusPath({ gateId: gateId.trim(), wallet: wallet.trim(), cluster });
      setNotice("");
      if (next === `/status?${key}`) setRefresh(value => value + 1);
      else router.push(next);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Invalid addresses."); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(new URL(canonicalPath, window.location.origin).toString()); setNotice("Public status link copied."); }
    catch { setNotice("Could not copy automatically. Copy the URL from your browser’s address bar."); }
  };
  return <Container maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
    <Stack spacing={3}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box component="img" src="/images/grape_access_logo.png" alt="Grape Access" sx={{ width: 48, height: 48, objectFit: "contain" }} />
        <Box><Typography variant="h4" component="h1">Public access status</Typography><Typography color="text.secondary">A shareable record for your wallet and community.</Typography></Box>
      </Stack>
      <Paper sx={{ p: { xs: 2.5, sm: 4 }, overflow: "hidden" }}>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1} alignItems="center"><ShieldRoundedIcon color="primary" /><Typography variant="overline">On-chain access record</Typography>{selection && <Chip size="small" label={labels[selection.cluster]} />}</Stack>
          {!hasQuery && <Typography>Enter a wallet and gate to view their public access-check record. No wallet connection or signature is needed.</Typography>}
          {inputError && <Alert severity="error">{inputError}</Alert>}
          {selection && (!current || current.state === "loading") && <Stack direction="row" spacing={1.5} role="status"><CircularProgress size={22} /><Typography>Reading the gate and wallet record…</Typography></Stack>}
          {current?.state === "error" && <Alert severity="warning"><strong>Status unavailable</strong><br />{current.message} This is not an eligibility failure.</Alert>}
          {result && <>
            <Typography variant="h3" component="h2" sx={{ fontSize: { xs: "1.9rem", sm: "2.5rem" }, color: result.state === "recorded-pass" ? "primary.light" : "text.primary" }}>{titles[result.state]}</Typography>
            {result.checkedAt !== undefined && <Typography>Recorded {new Date(result.checkedAt * 1000).toUTCString()}</Typography>}
            {result.state === "no-record" && <Alert severity="info">No completed stored check was found. A simulation does not create a public record, and a record may have been closed. This does not mean the wallet is ineligible.</Alert>}
            {result.state === "gate-missing" && <Alert severity="info">No gate account was found for this ID on {selection && labels[selection.cluster]}. Check the network and gate ID. No eligibility conclusion was made.</Alert>}
            {result.gateActive === false && <Alert severity="warning">This gate is currently inactive. A previous passing check does not grant current access.</Alert>}
            {result.checkedAt !== undefined && <Alert severity="info">This is a historical check, not a fresh eligibility assessment. Reputation, verification, wallet links and gate requirements may have changed since then.</Alert>}
          </>}
          {selection && <Stack spacing={1} sx={{ overflowWrap: "anywhere" }}>
            <Typography variant="body2" color="text.secondary">Wallet</Typography><Typography className="mono">{selection.wallet}</Typography>
            <Typography variant="body2" color="text.secondary">Gate ID</Typography><Typography className="mono">{selection.gateId}</Typography>
            <Typography variant="caption" color="text.secondary">This page describes the displayed wallet. Viewing or sharing it does not prove that the viewer controls the wallet.</Typography>
          </Stack>}
          {selection && <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button variant="contained" startIcon={<ContentCopyRoundedIcon />} onClick={() => void copyLink()}>Copy public link</Button>
            <Button variant="outlined" disabled={current?.state === "loading"} onClick={() => setRefresh(value => value + 1)}>Refresh record</Button>
            <Button href={memberPath}>Check current access</Button>
          </Stack>}
          {notice && <Alert severity="info" onClose={() => setNotice("")}>{notice}</Alert>}
          {result && <>
            <Divider />
            <Typography variant="caption" color="text.secondary">Read at confirmed slot {result.slot}. Retrieved {current?.fetchedAt ? new Date(current.fetchedAt).toUTCString() : ""}.</Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button size="small" href={explorer(result.gateAddress)} target="_blank" rel="noreferrer">Inspect gate</Button>
              <Button size="small" href={explorer(result.recordAddress)} target="_blank" rel="noreferrer">Inspect wallet record</Button>
            </Stack>
            {result.requirements.length > 0 && <><Typography variant="h6">Current gate requirements</Typography><Typography variant="body2" color="text.secondary">These are the gate’s requirements now, not a reconstruction of the policy when the record was written. Individual requirements have not been rechecked here.</Typography><Stack component="ul" spacing={1} sx={{ pl: 2.5, overflowWrap: "anywhere" }}>{result.requirements.map(line => <Typography component="li" variant="body2" key={line}>{line}</Typography>)}</Stack></>}
          </>}
          <Divider />
          <Typography variant="body2" color="text.secondary">Access status only. This page does not establish reward eligibility, prevent duplicate claims, or prove a unique person. Verification and wallet linking stay in the Verification dashboard.</Typography>
        </Stack>
      </Paper>
      <Paper component="form" onSubmit={submit} sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Typography variant="h6">Look up a wallet</Typography>
          <TextField required label="Wallet address" value={wallet} onChange={event => setWallet(event.target.value)} fullWidth />
          <TextField required label="Gate ID" helperText="Use the gate identifier, not the gate account address." value={gateId} onChange={event => setGateId(event.target.value)} fullWidth />
          <TextField select label="Network" value={cluster} onChange={event => setCluster(event.target.value as PublicCluster)}>{Object.entries(labels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
          <Button type="submit" variant="outlined">View public status</Button>
          <Typography variant="caption" color="text.secondary">Shared links expose this wallet, gate and network. Custom RPC credentials and social account identifiers are never included.</Typography>
        </Stack>
      </Paper>
    </Stack>
  </Container>;
}
