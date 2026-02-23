"use client";

import { PropsWithChildren, useMemo } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TrustWalletAdapter
} from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

export function Providers({ children }: PropsWithChildren) {
  const shyftMainnetRpc =
    process.env.NEXT_PUBLIC_SHYFT_MAINNET_RPC?.trim() ||
    "https://api.mainnet-beta.solana.com";
  const endpoint = useMemo(
    () =>
      process.env.NEXT_PUBLIC_WALLET_CONNECTOR_RPC ??
      shyftMainnetRpc,
    [shyftMainnetRpc]
  );
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new TrustWalletAdapter()],
    []
  );

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: "dark",
          primary: {
            main: "#3dd7a4",
            light: "#69e4bc",
            dark: "#22b183"
          },
          secondary: {
            main: "#6db8ff",
            light: "#91cbff",
            dark: "#4b91d1"
          },
          background: {
            default: "#070b14",
            paper: "#0f1728"
          },
          text: {
            primary: "#e5edff",
            secondary: "#97a8cf"
          }
        },
        typography: {
          fontFamily: "var(--font-sora), sans-serif",
          h1: { fontWeight: 700 },
          h2: { fontWeight: 700 },
          h3: { fontWeight: 700 },
          h4: { fontWeight: 700 },
          h5: { fontWeight: 600 },
          h6: { fontWeight: 600 },
          button: {
            textTransform: "none",
            fontWeight: 600
          }
        },
        shape: {
          borderRadius: 14
        },
        components: {
          MuiPaper: {
            styleOverrides: {
              root: {
                border: "1px solid rgba(123, 162, 225, 0.18)",
                boxShadow: "0 14px 34px rgba(2, 8, 23, 0.42)",
                backgroundImage:
                  "linear-gradient(180deg, rgba(109,184,255,0.05) 0%, rgba(15,23,40,0) 45%)"
              }
            }
          },
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: 10,
                paddingInline: 14
              },
              contained: {
                boxShadow: "0 8px 22px rgba(34, 177, 131, 0.26)"
              }
            }
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                backgroundColor: "rgba(10, 16, 30, 0.86)"
              }
            }
          },
          MuiTabs: {
            styleOverrides: {
              indicator: {
                height: 3,
                borderRadius: 99
              }
            }
          },
          MuiTab: {
            styleOverrides: {
              root: {
                minHeight: 42,
                borderRadius: 10,
                fontWeight: 600
              }
            }
          }
        }
      }),
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
