import type { AppProps } from "next/app";
import "../styles/premium.module.css"; // ensure variables available globally

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
