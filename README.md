# FoodSaaS 🍕

Plataforma completa de cardápio digital, delivery e gestão para restaurantes.

---

## Como instalar (Windows)

### Primeira vez — instalação completa

1. **Baixe e instale o Docker Desktop**
   - Acesse: https://www.docker.com/products/docker-desktop
   - Baixe para Windows, instale e **abra o programa**
   - Aguarde o ícone da baleia aparecer na barra de tarefas

2. **Execute o instalador automático**
   - Clique com o botão direito no arquivo **`instalar.ps1`**
   - Selecione **"Executar com o PowerShell"**
   - Se aparecer aviso de segurança, clique em **"Executar assim mesmo"**
   - Aguarde o processo terminar (5–10 minutos na primeira vez)

3. **Pronto!** O navegador abrirá automaticamente com o sistema.

---

### Próximas vezes — só para iniciar

Dê **duplo clique** no arquivo **`iniciar.bat`**

---

## Credenciais de acesso

| O que | Endereço |
|-------|----------|
| Painel admin | http://localhost:3000/login |
| Cardápio demo | http://localhost:3000/menu/pizzaria-do-jose |

| Usuário | Email | Senha |
|---------|-------|-------|
| Administrador | admin@pizzariadojose.com | Admin@123 |
| Garçom | garcom@pizzariadojose.com | Garcom@123 |

---

## O que o sistema faz

- Cardápio digital com QR Code por mesa
- Delivery com zonas de entrega e taxa automática
- Pagamento PIX com confirmação automática
- Kanban de pedidos em tempo real
- WhatsApp com notificações automáticas
- Impressão automática para cozinha
- Relatórios de vendas e faturamento
- Fidelidade e cashback para clientes
- Multi-PDV para múltiplas unidades

---

Para parar o sistema: pressione **CTRL+C** no terminal.

---

## Publicar no GitHub e colocar no ar

1. Dê duplo clique em **`publicar.ps1`** → segue as instruções
2. O script cria o repositório, envia o código e conecta com a Vercel
3. Para atualizações futuras: duplo clique em **`atualizar.ps1`**

Guia detalhado: **`PUBLICAR-NO-GITHUB.md`**
