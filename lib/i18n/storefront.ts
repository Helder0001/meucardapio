// lib/i18n/storefront.ts
//
// Dicionário do escopo STOREFRONT (cardápio público que o cliente final
// vê) — cookie e contexto totalmente independentes do dashboard e da
// landing. Não é por tenant: é o idioma que o VISITANTE escolhe no
// navegador dele (um turista que fala inglês quer inglês em qualquer
// cardápio que ele escaneie, não só num restaurante específico).
//
// Cobre: barra superior (busca + nav + carrinho), ficha de produto
// (product-card.tsx / product-modal.tsx), carrinho/checkout completo
// (cart-drawer.tsx) e o modal "Mais informações" (InfoModal, dentro de
// storefront-client.tsx). Ver I18N-ROADMAP.md para o que falta (nomes/
// descrições de produtos cadastrados pelo restaurante — são dados do
// banco, não strings de UI).

export type StorefrontLocale = 'pt-BR' | 'en' | 'es'

export const STOREFRONT_LOCALE_COOKIE = 'mc_storefront_locale'
export const STOREFRONT_DEFAULT_LOCALE: StorefrontLocale = 'pt-BR'

export const STOREFRONT_LOCALES: { code: StorefrontLocale; label: string; flag: string }[] = [
  { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
]

interface PaymentLabel { label: string; sub: string }

export interface StorefrontDict {
  searchPlaceholder: string
  nav: { inicio: string; ofertas: string; pedidos: string; avaliacoes: string; whatsapp: string }
  theme: { light: string; dark: string }
  cart: { label: string }
  table: string
  viewOnlyNotice: string
  closedDefault: string
  languageSwitcher: { label: string }
  moreInfo: string
  orderStatus: Record<'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED', string>
  myOrders: {
    title: string; notLoggedInTitle: string; notLoggedInSubtitle: string; loginBtn: string
    defaultCustomerName: string; logout: string; pointsLabel: string; cashbackLabel: string
    emptyTitle: string; emptySubtitle: string
  }
  authModal: {
    titlePhone: string; titleOtp: string; titleProfile: string
    subtitlePhone: string; subtitleOtpPrefix: string; subtitleProfile: string
    whatsappLabel: string; phonePlaceholder: string; sendCodeBtn: string; sending: string
    devCodeLabel: string; otpLabel: string; verifyingBtn: string; confirmBtn: string
    nameLabel: string; namePlaceholder: string; saveBtn: string
    errIncompleteCode: string; errInvalidCode: string; errConnection: string; errInvalidPhone: string; errSendCode: string
  }

  productCard: {
    outOfStock: string; bestSeller: string; featured: string
    minutesSuffix: string; moreOptions: string
  }
  productModal: {
    chooseOne: string; chooseUpTo: string; required: string; optional: string
    selectAtLeast: string; notesLabel: string; notesOptional: string; notesPlaceholder: string
    addButton: string; addedToast: string; outOfStockButton: string; closedButton: string
  }
  days: string[]
  infoModal: {
    tabs: { about: string; hours: string; payment: string }
    contact: string; address: string; noContactInfo: string
    closedLabel: string; hoursNotConfigured: string; defaultPayments: string
  }
  checkout: {
    steps: { cart: string; info: string; payment: string }
    emptyTitle: string; emptySubtitle: string; seeMenu: string
    orderAgainLabel: string; addedToast: string; removeLabel: string
    couponPlaceholder: string; couponRemove: string
    cashbackAvailable: string; cashbackBalance: string; cashbackUsing: string; cashbackMax: string; inTotalSuffix: string
    loyaltyUsePoints: string; loyaltyYouHave: string; loyaltyEvery: string; loyaltyUsing: string; loyaltyRemaining: string
    howToReceive: string; delivery: string; pickup: string
    streetPlaceholder: string; noAddressFound: string; searchingLocation: string; useMyLocation: string
    deliveryAvailable: string; freeShipping: string
    streetComplementPlaceholder: string; numberPlaceholder: string; editLabel: string
    phoneLabel: string; phoneHelp: string; phoneOptionalTable: string
    nameLabel: string; namePlaceholder: string; phonePlaceholder: string
    paymentMethods: string; splitButton: string; paymentNumbered: string; paymentSingular: string
    onlinePaymentHeading: string; manualPaymentHeading: string
    valuePlaceholder: string; changeForLabel: string; changeForPlaceholder: string
    allocated: string; missingToAllocate: string
    subtotal: string; deliveryFeeLabel: string; freeLabel: string; couponLabel: string
    cashbackLabel: string; pointsLabel: string; ptsSuffix: string
    estimatedTotal: string; finalValueNote: string; demoOrderDisabledNotice: string
    continueBtn: string; back: string; sending: string; placeOrder: string
    errCepDelivery: string; errAddressBeforeContinue: string; errNumber: string; errConfirmLocation: string
    errPhone: string; errName: string; errPaymentAmounts: string
    demoOrderError: string; couponInvalid: string; couponError: string; couponApplied: string
    orderSuccess: string; orderError: string
    cepOutOfArea: string; cepFetchError: string; addressOutOfArea: string; cepNotFound: string
    geoNotSupported: string; addressNotFound: string; addressFetchError: string; locationPermissionError: string
    onlinePayment: { pix: PaymentLabel; pixManual: PaymentLabel; creditOnline: PaymentLabel }
    manualPayment: { cash: PaymentLabel; creditManual: PaymentLabel; debit: PaymentLabel }
  }
}

const pt: StorefrontDict = {
  searchPlaceholder: 'Buscar no cardápio…',
  nav: { inicio: 'Início', ofertas: 'Ofertas', pedidos: 'Pedidos', avaliacoes: 'Avaliações', whatsapp: 'WhatsApp' },
  theme: { light: 'Claro', dark: 'Escuro' },
  cart: { label: 'Carrinho' },
  table: 'Mesa',
  viewOnlyNotice: 'Cardápio somente para consulta — peça com a equipe',
  closedDefault: 'Estabelecimento fechado no momento.',
  languageSwitcher: { label: 'Idioma' },
  moreInfo: 'Mais informações',
  orderStatus: {
    PENDING: 'Pendente', CONFIRMED: 'Confirmado', PREPARING: 'Preparando',
    READY: 'Pronto', OUT_FOR_DELIVERY: 'Saiu para entrega', DELIVERED: 'Entregue', CANCELLED: 'Cancelado',
  },
  myOrders: {
    title: 'Meus pedidos', notLoggedInTitle: 'Entre para ver seus pedidos',
    notLoggedInSubtitle: 'Use seu WhatsApp para acompanhar pedidos e pontos de fidelidade', loginBtn: 'Entrar / Cadastrar',
    defaultCustomerName: 'Cliente', logout: 'Sair', pointsLabel: 'pontos', cashbackLabel: 'cashback',
    emptyTitle: 'Nenhum pedido ainda', emptySubtitle: 'Seus pedidos aparecem aqui depois que você fizer o primeiro',
  },
  authModal: {
    titlePhone: 'Entrar / Cadastrar', titleOtp: 'Verificar número', titleProfile: 'Seu nome',
    subtitlePhone: 'Use seu WhatsApp para acompanhar pedidos e pontos de fidelidade',
    subtitleOtpPrefix: 'Código enviado para', subtitleProfile: 'Informe seu nome para identificação',
    whatsappLabel: 'WhatsApp', phonePlaceholder: '(11) 99999-9999', sendCodeBtn: 'Enviar código', sending: 'Enviando...',
    devCodeLabel: '🧪 Código de desenvolvimento:', otpLabel: 'Código de verificação',
    verifyingBtn: 'Verificando...', confirmBtn: 'Confirmar',
    nameLabel: 'Seu nome', namePlaceholder: 'João Silva', saveBtn: 'Salvar',
    errIncompleteCode: 'Digite o código completo', errInvalidCode: 'Código inválido', errConnection: 'Erro de conexão', errInvalidPhone: 'Digite um número válido', errSendCode: 'Erro ao enviar código',
  },
  productCard: { outOfStock: 'Esgotado', bestSeller: 'Mais pedido', featured: 'Destaque', minutesSuffix: 'min', moreOptions: '+ opções' },
  productModal: {
    chooseOne: 'Escolha 1 opção', chooseUpTo: 'Escolha até {max}', required: 'Obrigatório', optional: 'Opcional',
    selectAtLeast: 'Selecione pelo menos {min} opção', notesLabel: 'Observações', notesOptional: '(opcional)',
    notesPlaceholder: 'Ex: sem cebola, bem passado...', addButton: 'Adicionar', addedToast: '{name} adicionado! 🛒',
    outOfStockButton: 'Produto esgotado', closedButton: 'Loja fechada no momento',
  },
  days: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  infoModal: {
    tabs: { about: 'Sobre', hours: 'Horário', payment: 'Pagamento' },
    contact: 'Contato', address: 'Endereço', noContactInfo: 'Informações de contato não configuradas.',
    closedLabel: 'Fechado', hoursNotConfigured: 'Horários não configurados.',
    defaultPayments: 'PIX, Dinheiro, Cartão de Crédito/Débito',
  },
  checkout: {
    steps: { cart: 'Carrinho', info: 'Seus dados', payment: 'Pagamento' },
    emptyTitle: 'Seu carrinho está vazio', emptySubtitle: 'Adicione algo delicioso!', seeMenu: 'Ver cardápio',
    orderAgainLabel: 'Peça também', addedToast: '{name} adicionado', removeLabel: 'Remover',
    couponPlaceholder: 'Código do cupom', couponRemove: 'Remover',
    cashbackAvailable: '💰 Cashback disponível', cashbackBalance: 'Saldo:', cashbackUsing: 'Usando:', cashbackMax: 'Máx:', inTotalSuffix: 'no total',
    loyaltyUsePoints: '⭐ Usar pontos de fidelidade', loyaltyYouHave: 'Você tem', loyaltyEvery: 'A cada', loyaltyUsing: 'Usando:', loyaltyRemaining: 'Restam:',
    howToReceive: 'Como deseja receber?', delivery: 'Entrega', pickup: 'Retirada',
    streetPlaceholder: 'Digite o nome da rua', noAddressFound: 'Nenhum endereço encontrado.',
    searchingLocation: 'Buscando sua localização…', useMyLocation: 'Usar minha localização',
    deliveryAvailable: 'Entrega disponível', freeShipping: 'Frete grátis 🎉',
    streetComplementPlaceholder: 'Rua, complemento *', numberPlaceholder: 'Nº *', editLabel: 'editar',
    phoneLabel: 'Telefone (WhatsApp) *', phoneHelp: 'Você receberá atualizações do pedido via WhatsApp',
    phoneOptionalTable: 'Telefone (opcional, para atualizações via WhatsApp)',
    nameLabel: 'Seu nome *', namePlaceholder: 'João Silva', phonePlaceholder: '(11) 99999-9999',
    paymentMethods: 'Formas de pagamento', splitButton: 'Dividir', paymentNumbered: 'Pagamento {n}', paymentSingular: 'Forma de pagamento',
    onlinePaymentHeading: 'Pagamento online — cobrado agora', manualPaymentHeading: 'Pagamento na entrega/retirada',
    valuePlaceholder: 'Valor', changeForLabel: 'Troco para quanto?', changeForPlaceholder: 'Ex: 50.00',
    allocated: 'Alocado', missingToAllocate: 'Falta alocar',
    subtotal: 'Subtotal', deliveryFeeLabel: 'Entrega', freeLabel: '🎉 Grátis', couponLabel: '🏷 Cupom',
    cashbackLabel: '💰 Cashback', pointsLabel: '⭐ Pontos', ptsSuffix: 'pts',
    estimatedTotal: 'Total estimado', finalValueNote: '* Valor final confirmado pelo servidor',
    demoOrderDisabledNotice: '🧪 Isso é uma demonstração — a confirmação do pedido está desativada.',
    continueBtn: 'Continuar', back: 'Voltar', sending: 'Enviando...', placeOrder: 'Fazer pedido',
    errCepDelivery: 'Informe um CEP válido na área de entrega', errAddressBeforeContinue: 'Informe o endereço completo antes de continuar',
    errNumber: 'Informe o número da casa/apartamento', errConfirmLocation: 'Confirme sua localização no mapa antes de continuar',
    errPhone: 'Informe seu telefone', errName: 'Informe seu nome', errPaymentAmounts: 'Informe o valor de cada forma de pagamento',
    demoOrderError: 'Isso é uma demonstração — pedidos não são finalizados de verdade aqui.',
    couponInvalid: 'Cupom inválido', couponError: 'Erro ao validar cupom', couponApplied: 'Cupom aplicado! {desc}',
    orderSuccess: 'Pedido realizado! 🎉', orderError: 'Erro ao realizar pedido. Tente novamente.',
    cepOutOfArea: 'Seu CEP está fora da área de entrega.', cepFetchError: 'Erro ao buscar CEP. Verifique sua conexão.', cepNotFound: 'CEP não encontrado. Você pode digitar o endereço manualmente.',
    addressOutOfArea: 'Esse endereço está fora da área de entrega.', geoNotSupported: 'Seu navegador não suporta compartilhar localização.',
    addressNotFound: 'Não conseguimos identificar seu endereço. Tente buscar pelo nome da rua.',
    addressFetchError: 'Erro ao buscar seu endereço. Tente novamente.',
    locationPermissionError: 'Não foi possível acessar sua localização — verifique a permissão do navegador.',
    onlinePayment: {
      pix: { label: '⚡ PIX', sub: 'Confirmação automática' },
      pixManual: { label: '⚡ PIX (chave direta)', sub: 'Confirmação em alguns minutos, após envio do comprovante' },
      creditOnline: { label: '💳 Crédito', sub: 'Pague agora, na hora' },
    },
    manualPayment: {
      cash: { label: '💵 Dinheiro', sub: 'Pague na entrega/retirada' },
      creditManual: { label: '💳 Crédito', sub: 'Na maquininha, na entrega/retirada' },
      debit: { label: '💳 Débito', sub: 'Na maquininha, na entrega/retirada' },
    },
  },
}

const en: StorefrontDict = {
  searchPlaceholder: 'Search the menu…',
  nav: { inicio: 'Home', ofertas: 'Offers', pedidos: 'Orders', avaliacoes: 'Reviews', whatsapp: 'WhatsApp' },
  theme: { light: 'Light', dark: 'Dark' },
  cart: { label: 'Cart' },
  table: 'Table',
  viewOnlyNotice: 'Menu for browsing only — order with staff',
  closedDefault: 'Closed right now.',
  languageSwitcher: { label: 'Language' },
  moreInfo: 'More info',
  orderStatus: {
    PENDING: 'Pending', CONFIRMED: 'Confirmed', PREPARING: 'Preparing',
    READY: 'Ready', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
  },
  myOrders: {
    title: 'My orders', notLoggedInTitle: 'Log in to see your orders',
    notLoggedInSubtitle: 'Use your WhatsApp to track orders and loyalty points', loginBtn: 'Log in / Sign up',
    defaultCustomerName: 'Customer', logout: 'Log out', pointsLabel: 'points', cashbackLabel: 'cashback',
    emptyTitle: 'No orders yet', emptySubtitle: 'Your orders show up here after your first one',
  },
  authModal: {
    titlePhone: 'Log in / Sign up', titleOtp: 'Verify number', titleProfile: 'Your name',
    subtitlePhone: 'Use your WhatsApp to track orders and loyalty points',
    subtitleOtpPrefix: 'Code sent to', subtitleProfile: 'Enter your name to identify yourself',
    whatsappLabel: 'WhatsApp', phonePlaceholder: '(11) 99999-9999', sendCodeBtn: 'Send code', sending: 'Sending...',
    devCodeLabel: '🧪 Dev code:', otpLabel: 'Verification code',
    verifyingBtn: 'Verifying...', confirmBtn: 'Confirm',
    nameLabel: 'Your name', namePlaceholder: 'John Smith', saveBtn: 'Save',
    errIncompleteCode: 'Enter the full code', errInvalidCode: 'Invalid code', errConnection: 'Connection error', errInvalidPhone: 'Enter a valid number', errSendCode: 'Error sending code',
  },
  productCard: { outOfStock: 'Sold out', bestSeller: 'Best seller', featured: 'Featured', minutesSuffix: 'min', moreOptions: '+ options' },
  productModal: {
    chooseOne: 'Choose 1 option', chooseUpTo: 'Choose up to {max}', required: 'Required', optional: 'Optional',
    selectAtLeast: 'Select at least {min} option', notesLabel: 'Notes', notesOptional: '(optional)',
    notesPlaceholder: 'E.g.: no onion, well done...', addButton: 'Add', addedToast: '{name} added! 🛒',
    outOfStockButton: 'Out of stock', closedButton: 'Store closed right now',
  },
  days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  infoModal: {
    tabs: { about: 'About', hours: 'Hours', payment: 'Payment' },
    contact: 'Contact', address: 'Address', noContactInfo: 'Contact information not set up.',
    closedLabel: 'Closed', hoursNotConfigured: 'Hours not set up.',
    defaultPayments: 'PIX, Cash, Credit/Debit Card',
  },
  checkout: {
    steps: { cart: 'Cart', info: 'Your info', payment: 'Payment' },
    emptyTitle: 'Your cart is empty', emptySubtitle: 'Add something delicious!', seeMenu: 'See menu',
    orderAgainLabel: 'You might also like', addedToast: '{name} added', removeLabel: 'Remove',
    couponPlaceholder: 'Coupon code', couponRemove: 'Remove',
    cashbackAvailable: '💰 Cashback available', cashbackBalance: 'Balance:', cashbackUsing: 'Using:', cashbackMax: 'Max:', inTotalSuffix: 'off the total',
    loyaltyUsePoints: '⭐ Use loyalty points', loyaltyYouHave: 'You have', loyaltyEvery: 'Every', loyaltyUsing: 'Using:', loyaltyRemaining: 'Remaining:',
    howToReceive: 'How would you like to receive it?', delivery: 'Delivery', pickup: 'Pickup',
    streetPlaceholder: 'Enter the street name', noAddressFound: 'No address found.',
    searchingLocation: 'Finding your location…', useMyLocation: 'Use my location',
    deliveryAvailable: 'Delivery available', freeShipping: 'Free shipping 🎉',
    streetComplementPlaceholder: 'Street, apt/unit *', numberPlaceholder: 'No. *', editLabel: 'edit',
    phoneLabel: 'Phone (WhatsApp) *', phoneHelp: "You'll get order updates via WhatsApp",
    phoneOptionalTable: 'Phone (optional, for WhatsApp updates)',
    nameLabel: 'Your name *', namePlaceholder: 'John Smith', phonePlaceholder: '(11) 99999-9999',
    paymentMethods: 'Payment methods', splitButton: 'Split', paymentNumbered: 'Payment {n}', paymentSingular: 'Payment method',
    onlinePaymentHeading: 'Pay online — charged now', manualPaymentHeading: 'Pay on delivery/pickup',
    valuePlaceholder: 'Amount', changeForLabel: 'Change for how much?', changeForPlaceholder: 'E.g.: 50.00',
    allocated: 'Allocated', missingToAllocate: 'Still to allocate',
    subtotal: 'Subtotal', deliveryFeeLabel: 'Delivery', freeLabel: '🎉 Free', couponLabel: '🏷 Coupon',
    cashbackLabel: '💰 Cashback', pointsLabel: '⭐ Points', ptsSuffix: 'pts',
    estimatedTotal: 'Estimated total', finalValueNote: '* Final amount confirmed by the server',
    demoOrderDisabledNotice: '🧪 This is a demo — order confirmation is disabled.',
    continueBtn: 'Continue', back: 'Back', sending: 'Sending...', placeOrder: 'Place order',
    errCepDelivery: 'Enter a valid zip code within the delivery area', errAddressBeforeContinue: 'Enter the full address before continuing',
    errNumber: 'Enter the house/apartment number', errConfirmLocation: 'Confirm your location on the map before continuing',
    errPhone: 'Enter your phone number', errName: 'Enter your name', errPaymentAmounts: 'Enter the amount for each payment method',
    demoOrderError: 'This is a demo — orders are not actually placed here.',
    couponInvalid: 'Invalid coupon', couponError: 'Error validating coupon', couponApplied: 'Coupon applied! {desc}',
    orderSuccess: 'Order placed! 🎉', orderError: 'Error placing order. Please try again.',
    cepOutOfArea: 'Your zip code is outside the delivery area.', cepFetchError: 'Error looking up zip code. Check your connection.', cepNotFound: 'Zip code not found. You can enter the address manually.',
    addressOutOfArea: 'This address is outside the delivery area.', geoNotSupported: "Your browser doesn't support sharing location.",
    addressNotFound: "We couldn't identify your address. Try searching by street name.",
    addressFetchError: 'Error looking up your address. Please try again.',
    locationPermissionError: "We couldn't access your location — check your browser permissions.",
    onlinePayment: {
      pix: { label: '⚡ PIX', sub: 'Automatic confirmation' },
      pixManual: { label: '⚡ PIX (direct key)', sub: 'Confirmed within minutes, after receipt is sent' },
      creditOnline: { label: '💳 Credit', sub: 'Pay now, right away' },
    },
    manualPayment: {
      cash: { label: '💵 Cash', sub: 'Pay on delivery/pickup' },
      creditManual: { label: '💳 Credit', sub: 'On the card machine, at delivery/pickup' },
      debit: { label: '💳 Debit', sub: 'On the card machine, at delivery/pickup' },
    },
  },
}

const es: StorefrontDict = {
  searchPlaceholder: 'Buscar en el menú…',
  nav: { inicio: 'Inicio', ofertas: 'Ofertas', pedidos: 'Pedidos', avaliacoes: 'Reseñas', whatsapp: 'WhatsApp' },
  theme: { light: 'Claro', dark: 'Oscuro' },
  cart: { label: 'Carrito' },
  table: 'Mesa',
  viewOnlyNotice: 'Menú solo para consulta — pida con el personal',
  closedDefault: 'Cerrado en este momento.',
  languageSwitcher: { label: 'Idioma' },
  moreInfo: 'Más información',
  orderStatus: {
    PENDING: 'Pendiente', CONFIRMED: 'Confirmado', PREPARING: 'Preparando',
    READY: 'Listo', OUT_FOR_DELIVERY: 'En camino', DELIVERED: 'Entregado', CANCELLED: 'Cancelado',
  },
  myOrders: {
    title: 'Mis pedidos', notLoggedInTitle: 'Inicia sesión para ver tus pedidos',
    notLoggedInSubtitle: 'Usa tu WhatsApp para seguir pedidos y puntos de fidelidad', loginBtn: 'Iniciar sesión / Registrarse',
    defaultCustomerName: 'Cliente', logout: 'Salir', pointsLabel: 'puntos', cashbackLabel: 'cashback',
    emptyTitle: 'Aún no hay pedidos', emptySubtitle: 'Tus pedidos aparecen aquí después de tu primer pedido',
  },
  authModal: {
    titlePhone: 'Iniciar sesión / Registrarse', titleOtp: 'Verificar número', titleProfile: 'Tu nombre',
    subtitlePhone: 'Usa tu WhatsApp para seguir pedidos y puntos de fidelidad',
    subtitleOtpPrefix: 'Código enviado a', subtitleProfile: 'Ingresa tu nombre para identificarte',
    whatsappLabel: 'WhatsApp', phonePlaceholder: '(11) 99999-9999', sendCodeBtn: 'Enviar código', sending: 'Enviando...',
    devCodeLabel: '🧪 Código de desarrollo:', otpLabel: 'Código de verificación',
    verifyingBtn: 'Verificando...', confirmBtn: 'Confirmar',
    nameLabel: 'Tu nombre', namePlaceholder: 'Juan Pérez', saveBtn: 'Guardar',
    errIncompleteCode: 'Ingresa el código completo', errInvalidCode: 'Código inválido', errConnection: 'Error de conexión', errInvalidPhone: 'Ingresa un número válido', errSendCode: 'Error al enviar el código',
  },
  productCard: { outOfStock: 'Agotado', bestSeller: 'Más pedido', featured: 'Destacado', minutesSuffix: 'min', moreOptions: '+ opciones' },
  productModal: {
    chooseOne: 'Elige 1 opción', chooseUpTo: 'Elige hasta {max}', required: 'Obligatorio', optional: 'Opcional',
    selectAtLeast: 'Selecciona al menos {min} opción', notesLabel: 'Observaciones', notesOptional: '(opcional)',
    notesPlaceholder: 'Ej: sin cebolla, bien cocido...', addButton: 'Agregar', addedToast: '¡{name} agregado! 🛒',
    outOfStockButton: 'Producto agotado', closedButton: 'Tienda cerrada en este momento',
  },
  days: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  infoModal: {
    tabs: { about: 'Sobre', hours: 'Horario', payment: 'Pago' },
    contact: 'Contacto', address: 'Dirección', noContactInfo: 'Información de contacto no configurada.',
    closedLabel: 'Cerrado', hoursNotConfigured: 'Horarios no configurados.',
    defaultPayments: 'PIX, Efectivo, Tarjeta de Crédito/Débito',
  },
  checkout: {
    steps: { cart: 'Carrito', info: 'Tus datos', payment: 'Pago' },
    emptyTitle: 'Tu carrito está vacío', emptySubtitle: '¡Agrega algo delicioso!', seeMenu: 'Ver menú',
    orderAgainLabel: 'También puedes pedir', addedToast: '{name} agregado', removeLabel: 'Quitar',
    couponPlaceholder: 'Código del cupón', couponRemove: 'Quitar',
    cashbackAvailable: '💰 Cashback disponible', cashbackBalance: 'Saldo:', cashbackUsing: 'Usando:', cashbackMax: 'Máx:', inTotalSuffix: 'del total',
    loyaltyUsePoints: '⭐ Usar puntos de fidelidad', loyaltyYouHave: 'Tienes', loyaltyEvery: 'Cada', loyaltyUsing: 'Usando:', loyaltyRemaining: 'Quedan:',
    howToReceive: '¿Cómo deseas recibirlo?', delivery: 'Entrega', pickup: 'Retiro',
    streetPlaceholder: 'Escribe el nombre de la calle', noAddressFound: 'No se encontró ninguna dirección.',
    searchingLocation: 'Buscando tu ubicación…', useMyLocation: 'Usar mi ubicación',
    deliveryAvailable: 'Entrega disponible', freeShipping: 'Envío gratis 🎉',
    streetComplementPlaceholder: 'Calle, complemento *', numberPlaceholder: 'N.º *', editLabel: 'editar',
    phoneLabel: 'Teléfono (WhatsApp) *', phoneHelp: 'Recibirás actualizaciones del pedido por WhatsApp',
    phoneOptionalTable: 'Teléfono (opcional, para actualizaciones por WhatsApp)',
    nameLabel: 'Tu nombre *', namePlaceholder: 'Juan Pérez', phonePlaceholder: '(11) 99999-9999',
    paymentMethods: 'Formas de pago', splitButton: 'Dividir', paymentNumbered: 'Pago {n}', paymentSingular: 'Forma de pago',
    onlinePaymentHeading: 'Pago online — cobrado ahora', manualPaymentHeading: 'Pago en la entrega/retiro',
    valuePlaceholder: 'Monto', changeForLabel: '¿Cambio para cuánto?', changeForPlaceholder: 'Ej: 50.00',
    allocated: 'Asignado', missingToAllocate: 'Falta asignar',
    subtotal: 'Subtotal', deliveryFeeLabel: 'Entrega', freeLabel: '🎉 Gratis', couponLabel: '🏷 Cupón',
    cashbackLabel: '💰 Cashback', pointsLabel: '⭐ Puntos', ptsSuffix: 'pts',
    estimatedTotal: 'Total estimado', finalValueNote: '* Monto final confirmado por el servidor',
    demoOrderDisabledNotice: '🧪 Esto es una demostración — la confirmación del pedido está desactivada.',
    continueBtn: 'Continuar', back: 'Volver', sending: 'Enviando...', placeOrder: 'Hacer pedido',
    errCepDelivery: 'Ingresa un código postal válido dentro del área de entrega', errAddressBeforeContinue: 'Ingresa la dirección completa antes de continuar',
    errNumber: 'Ingresa el número de casa/apartamento', errConfirmLocation: 'Confirma tu ubicación en el mapa antes de continuar',
    errPhone: 'Ingresa tu teléfono', errName: 'Ingresa tu nombre', errPaymentAmounts: 'Ingresa el monto de cada forma de pago',
    demoOrderError: 'Esto es una demostración — los pedidos no se finalizan de verdad aquí.',
    couponInvalid: 'Cupón inválido', couponError: 'Error al validar el cupón', couponApplied: '¡Cupón aplicado! {desc}',
    orderSuccess: '¡Pedido realizado! 🎉', orderError: 'Error al realizar el pedido. Inténtalo de nuevo.',
    cepOutOfArea: 'Tu código postal está fuera del área de entrega.', cepFetchError: 'Error al buscar el código postal. Verifica tu conexión.', cepNotFound: 'Código postal no encontrado. Puedes escribir la dirección manualmente.',
    addressOutOfArea: 'Esa dirección está fuera del área de entrega.', geoNotSupported: 'Tu navegador no admite compartir la ubicación.',
    addressNotFound: 'No pudimos identificar tu dirección. Intenta buscar por el nombre de la calle.',
    addressFetchError: 'Error al buscar tu dirección. Inténtalo de nuevo.',
    locationPermissionError: 'No se pudo acceder a tu ubicación — verifica el permiso del navegador.',
    onlinePayment: {
      pix: { label: '⚡ PIX', sub: 'Confirmación automática' },
      pixManual: { label: '⚡ PIX (clave directa)', sub: 'Confirmación en minutos, tras enviar el comprobante' },
      creditOnline: { label: '💳 Crédito', sub: 'Paga ahora mismo' },
    },
    manualPayment: {
      cash: { label: '💵 Efectivo', sub: 'Paga en la entrega/retiro' },
      creditManual: { label: '💳 Crédito', sub: 'En el terminal, en la entrega/retiro' },
      debit: { label: '💳 Débito', sub: 'En el terminal, en la entrega/retiro' },
    },
  },
}

export const STOREFRONT_DICTIONARIES: Record<StorefrontLocale, StorefrontDict> = { 'pt-BR': pt, en, es }

export function getStorefrontDictionary(locale: string): StorefrontDict {
  return STOREFRONT_DICTIONARIES[locale as StorefrontLocale] ?? STOREFRONT_DICTIONARIES[STOREFRONT_DEFAULT_LOCALE]
}

export function resolveStorefrontLocale(cookieValue: string | null): StorefrontLocale {
  return (STOREFRONT_LOCALES.some((l) => l.code === cookieValue) ? cookieValue : STOREFRONT_DEFAULT_LOCALE) as StorefrontLocale
}
