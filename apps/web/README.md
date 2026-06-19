# 🖥️ AWLSRV Login Hub - UI

Interface administrativa para gerenciamento de infraestrutura do Identity Provider (IdP).
Este painel é utilizado exclusivamente pelo **Super Admin** para provisionar empresas (Tenants) e gerenciar usuários de forma centralizada.

<p align="center">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=react,ts,vite,bootstrap,tailwind,html,css" />
  </a>
</p>

---

## 🏗️ Estrutura do Projeto

O sistema utiliza **Vite** como build tool e segue uma arquitetura modular baseada em serviços para comunicação com a API:

- **`src/pages`**: Telas principais da aplicação (SPA).
- **`src/components`**: Componentes de UI reutilizáveis, incluindo Modais com efeitos de vidro (Glassmorphism).
- **`src/services`**: Camada de integração com o Backend via Axios. Inclui interceptadores para injeção automática de Tokens ou Master Keys.
- **`src/types`**: Definições de tipagem TypeScript (Interfaces para User, Company, DTOs e Respostas de API).
- **`src/utils`**: Utilitários para máscaras de input (CPF, CNPJ, Telefone).
- **`src/routes`**: Configuração de rotas e guardas de navegação.

---

## ✨ Funcionalidades Principais

### 🔐 1. Segurança e Autenticação Híbrida
- **Login Master:** Acesso administrativo via `VITE_MASTER_KEY` definida em ambiente, sem necessidade de banco de dados para o Super Admin.
- **Login Standard:** Suporte para autenticação convencional via JWT para usuários padrão.
- **Proteção de Sessão:** Gerenciamento seguro via `localStorage` e `sessionStorage` com limpeza automática ao expirar.

### 🏢 2. Gestão de Multi-Tenants (Empresas)
- **Dashboard de Empresas:** Listagem completa com indicadores visuais de status.
- **Onboarding Completo:** Fluxo transacional que cria a **Empresa** e o primeiro **Usuário Admin** simultaneamente.
- **Controle de Acesso:** Bloqueio e desbloqueio de tenants (Ativo/Inativo) em tempo real.
- **Edição Cadastral:** Atualização de dados corporativos (CNPJ, Email, Telefone).

### 👥 3. Gestão de Usuários
- **Visão Global:** O Super Admin pode visualizar todos os usuários de todas as empresas.
- **Visão por Tenant:** Filtragem de usuários vinculados a uma empresa específica.
- **CRUD de Usuários:** Criação, edição e remoção de credenciais de acesso.
- **Feedback Visual:** Modais de sucesso e confirmação de exclusão com animações CSS.

---

## 🛠️ Tecnologias Utilizadas

O projeto roda sobre **React 19** e utiliza uma abordagem híbrida de estilização para máxima flexibilidade.

| Tech | Versão | Função |
|------|--------|--------|
| **Vite** | ^7.2.4 | Build tool e servidor de desenvolvimento |
| **React** | ^19.2.0 | Biblioteca de UI Core |
| **TypeScript** | ~5.9.3 | Tipagem estática rigorosa |
| **Tailwind CSS** | ^3.4.17 | Estilização utilitária e layout |
| **Bootstrap** | ^5.3.8 | Componentes base e grid system |
| **Axios** | ^1.13.2 | Cliente HTTP com interceptors |
| **React Hook Form** | ^7.71.0 | Gerenciamento de estado de formulários |

---

## 🚀 Instalação e Configuração

### 1. Pré-requisitos
Certifique-se de que o Backend (`AWLSRV Login Hub API`) esteja rodando na porta `3000` (ou conforme configurado).

### 2. Instalar Dependências
```bash
npm install
```
### 3. Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` | Compila o projeto para produção (TSC + Vite) |
| `npm run lint` | Executa a verificação de código (ESLint) |
| `npm run preview` | Visualiza o build de produção localmente |

---

## 🎨 Design System

O projeto utiliza um sistema visual personalizado com efeitos de **Glassmorphism** (Vidro) nos modais de ação crítica:

- **Success Modal:** Feedback verde com animação `iconPulse`.
- **Logout Modal:** Feedback de alerta com animação `shake`.
- **Delete Modal:** Feedback de perigo (vermelho) com animação `pulseRed`.

---

**AWLSRV - Astral Wave Label** 🤵🏻