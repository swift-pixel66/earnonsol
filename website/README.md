# Website

Static HTML and CSS for an independent EARN on Solana landing page. The page links to both source directories and the Meteora DAMM V2 system architecture.

## Local preview

Run from the repository root:

```sh
python3 -m http.server 4178 --bind 127.0.0.1 --directory website
```

Open <http://127.0.0.1:4178>. No dependencies or build tools are required.

`index.html` contains the content and navigation; `styles.css` contains the layout and visual design. All artwork is drawn in CSS. The page does not connect a wallet or send transactions.

## Accessibility and layout

The layout collapses to one column on smaller screens. Navigation and card links have generous touch targets. Keyboard users can skip directly to the main content, and links retain visible focus indicators. Decorative artwork is excluded from the accessibility tree. Hover transitions respect the reduced-motion preference.
