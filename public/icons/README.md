## Ícones PWA

Os ícones em `/public/icons/` são SVGs que funcionam para desenvolvimento e maioria dos browsers modernos.
Para produção com suporte máximo (iOS Safari, Android Chrome), gere PNGs:

```bash
# Instalar sharp-cli globalmente
pnpm add -g sharp-cli

# Gerar PNGs a partir dos SVGs
sharp -i public/icons/icon-192.svg -o public/icons/icon-192.png resize 192
sharp -i public/icons/icon-512.svg -o public/icons/icon-512.png resize 512
```

Depois atualize `manifest.json` para referenciar os `.png`.