# Tela do Entregador — Rastreamento com Mapa e Rota

8 arquivos (5 novos, 3 modificados). Aplicado sobre o ZIP que você acabou
de enviar (não sobre os pacotes de correção de segurança anteriores —
se já aplicou aqueles, os 3 arquivos modificados aqui não conflitam com
eles).

## Stack escolhida: Leaflet + OSRM (grátis, sem API key)

Como conversamos: em vez do Google Maps Platform (que tem custo por
chamada), usei o mesmo Leaflet+OpenStreetMap que o projeto já usa pra
desenhar o mapa, e adicionei o **OSRM** (Open Source Routing Machine,
gratuito, mesmo espírito do Nominatim que vocês já usam pra geocodificar
endereço) só pra calcular a linha da rota, distância e tempo estimado.

O botão "Navegar" abre o Google Maps ou o Waze via **deep link** (sem SDK,
sem custo) — é ali que o entregador ganha navegação por voz de verdade.

**Importante:** o servidor público do OSRM (`router.project-osrm.org`) é
de uso leve/avaliação, não pra tráfego pesado de produção. Para o volume
inicial do MeuCardápio deve ser tranquilo (a tela já limita o recálculo de
rota a 1x a cada 30s por entrega ativa). Se o volume de entregas crescer
bastante, o caminho é subir uma instância própria do OSRM (é open-source,
roda em Docker com o mapa do Brasil) e trocar só a constante
`OSRM_BASE_URL` em `lib/utils/osrm.ts` — nenhum outro arquivo muda.

## Arquivos novos

- **`lib/utils/osrm.ts`** — `getDrivingRoute(origem, destino)`, chama o
  OSRM e devolve distância, duração e o traçado já no formato que o
  Leaflet espera.
- **`app/api/delivery/route/route.ts`** — endpoint que a tela do
  entregador chama pra pedir a rota. Fica atrás de sessão (só staff do
  próprio tenant) e do `apiLimiter` (60 req/min por IP) — protege o OSRM
  público de qualquer bug de polling que chame demais.
- **`components/dashboard/delivery-tracking-screen.tsx`** — a tela em si
  (o componente principal, client-side). Faz tudo:
  - Mostra o mapa com loja/entregador/destino + linha da rota;
  - Observa o GPS continuamente (`watchPosition`) e envia a posição pro
    servidor a cada ~8s, igual ao `courier-location-tracker.tsx` que já
    existia — só que agora chamado direto desta tela também, então a
    localização é enviada mesmo que o widget flutuante não esteja
    montado;
  - Recalcula a rota a cada ~30s (throttle, ver nota do OSRM acima);
  - **Wake Lock**: tenta manter a tela ligada enquanto a entrega está
    "saiu para entrega" — funciona de verdade enquanto a aba estiver em
    primeiro plano (suportado no Chrome Android e Safari iOS 16.4+); se o
    navegador não suportar, ou o entregador trocar de app/bloquear o
    celular, simplesmente não tem efeito — é uma limitação do navegador/SO
    que nenhum código web resolve sozinho, exatamente como você descreveu;
  - Botões "Iniciar entrega" / "Finalizar entrega" chamam o
    **mesmo endpoint que já existia**
    (`PATCH /api/orders/[id]/update-status`) — nenhuma lógica de negócio
    nova aqui, só a UI;
  - Botões "Google Maps" / "Waze" com os deep links.
- **`app/(dashboard)/dashboard/delivery/tracking/page.tsx`** — lista as
  entregas "saiu para entrega" do entregador logado (ou ainda sem
  entregador, pra ele poder assumir), com link pra cada uma.
- **`app/(dashboard)/dashboard/delivery/tracking/[orderId]/page.tsx`** —
  busca os dados do pedido no servidor e renderiza a tela acima. Reaplica
  a mesma regra de posse já usada em `update-status`: um entregador não
  abre a entrega de outro.

## Arquivos modificados

- **`components/storefront/delivery-live-map.tsx`** — ganhou uma prop
  `route` opcional que desenha a linha da rota (`Polyline` do
  react-leaflet). Retrocompatível: quem já usa esse componente sem passar
  `route` continua funcionando exatamente igual (usado hoje na página de
  acompanhamento do cliente, `order-tracking.tsx` — dá pra passar a rota
  pra lá também depois, se quiser o cliente vendo a linha azul também;
  não fiz essa parte agora pra manter o escopo focado na tela do
  entregador).
- **`proxy.ts`** — adicionado `/dashboard/delivery/tracking` em
  `ALLOWED_PREFIXES`, senão o middleware bloqueava STAFF/DELIVERY_PERSON
  de navegar pra essa página nova (mesma lista que já restringe esses
  papéis a `/dashboard/orders`).
- **`components/dashboard/sidebar.tsx`** — item "Minhas Entregas" no
  menu (visível pra DELIVERY_PERSON, TENANT_ADMIN, MANAGER) e na barra
  inferior mobile do DELIVERY_PERSON.

## O que verificar antes de subir

1. **Tenant precisa ter latitude/longitude cadastrados** em Configurações
   Gerais — sem isso não tem ponto de partida pra calcular rota (a tela
   ainda funciona, só sem a linha de rota até o GPS do entregador
   responder).
2. Testar o fluxo completo como usuário `DELIVERY_PERSON`: pedido em
   `READY` → abrir `/dashboard/delivery/tracking` → abrir a entrega →
   "Iniciar entrega" → conferir que o mapa do cliente
   (`order-tracking.tsx`, já existente) começa a mostrar o marcador do
   entregador se movendo → "Finalizar entrega".
3. Testar em celular de verdade (Wake Lock e GPS contínuo não têm o mesmo
   comportamento em desktop/emulador).
4. Como qualquer chamada de rede a um serviço de terceiros, vale monitorar
   se o OSRM público responde consistentemente no seu volume real de uso
   — se começar a falhar/atrasar, é o sinal pra migrar pra uma instância
   própria (ver nota acima).
