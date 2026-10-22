// ABOUT: The HTML shell for every page: language, and noindex until the launch PR
// ABOUT: Holds no inline scripts or styles, so the content security policy needs no 'unsafe-inline'

import { Head, Html, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en-GB">
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      <body>
        <noscript>This calculator needs JavaScript to work out your results.</noscript>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
