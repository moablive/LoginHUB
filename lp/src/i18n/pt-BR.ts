// Cópia PT-BR — idioma padrão. O `en.ts` é tipado a partir de `Messages`, então
// qualquer chave nova aqui vira erro de compilação lá até ser traduzida.
//
// O produto é o LOGINHUB, vendido por assinatura mensal (R$ 24,99). Desde
// 26/11/2026 a página não vende mais consultoria de segurança: quem assina entra
// no LoginHUB (cofre de senhas cifrado de ponta a ponta + código por e-mail
// obrigatório). Promessa nova só entra aqui se o LoginHUB já fizer — ver README.
const ptBR = {
  meta: {
    title: 'LoginHUB — Technology Astrał wave',
    description:
      'O cofre de senhas e a identidade central da Astrał wave, agora para você: senhas cifradas de ponta a ponta, entrada por código no seu e-mail (sem app extra), abertura pela digital e app no celular. R$ 24,99 por mês.',
    ogLocale: 'pt_BR',
  },

  nav: {
    problem: 'O problema',
    features: 'Recursos',
    how: 'Como funciona',
    security: 'Segurança',
    pricing: 'Assinatura',
    cta: 'Assinar',
    menu: 'Abrir menu',
    theme: 'Alternar tema',
    lang: 'Mudar idioma',
    products: 'Menu',
    login: 'Entrar',
    app: 'O app',
  },

  // Seletor de produtos do cabeçalho: o visitante da LP não tem como saber que
  // a Astrał wave também é gravadora e loja. Mesmo conteúdo do site e do Track.
  products: {
    title: 'Tudo que a Astrał wave faz',
    here: 'você está aqui',
    label: { name: 'Astrał wave Label', desc: 'A gravadora: artistas, lançamentos e demos.' },
    track: { name: 'Astrał wave Track', desc: 'Loja de faixas em WAV, pagas no Pix, direto de quem faz.' },
    security: { name: 'LoginHUB', desc: 'Cofre de senhas e login seguro, com código de acesso enviado ao seu e-mail.' },
    artist: { name: 'Painel do artista', desc: 'Onde o DJ acompanha lançamentos, contratos e vendas.' },
  },

  hero: {
    badge: 'Cofre de senhas e identidade · R$ 24,99 por mês',
    title: 'Todas as suas senhas em um cofre que nem a gente consegue abrir',
    subtitle:
      'O LoginHUB é a tecnologia de login e cofre que a Astrał wave usa nos próprios sistemas, agora na sua mão. As senhas são cifradas no seu aparelho, a entrada é por um código enviado ao seu e-mail, sem aplicativo extra, e o app se instala no celular.',
    ctaPrimary: 'Assinar por R$ 24,99/mês',
    ctaLogin: 'Entrar',
    ctaSecondary: 'Ver o app',
    stats: [
      { value: 'Ponta a ponta', label: 'cifrado no seu aparelho' },
      { value: 'E-mail', label: 'Código de acesso, sem app extra' },
      { value: 'R$ 24,99', label: 'por mês, no cartão' },
    ],
    vault: {
      label: 'Meu cofre',
      status: 'Código por e-mail · cifrado no aparelho',
      entries: [
        'Instagram @suamarca',
        'Meta Business Suite',
        'Google Ads',
        'Chaves de recuperação',
      ],
    },
  },

  problem: {
    kicker: 'O problema',
    title: 'A sua senha está em todo lugar, menos em um lugar seguro.',
    lead:
      'Navegador, planilha, bloco de notas, mensagem no WhatsApp. Quem trabalha com redes sociais, anúncios e plataformas acumula dezenas de acessos, e basta um vazar para o resto cair junto.',
    cards: [
      {
        title: 'Vinte, trinta contas — e a mesma senha em várias',
        body: 'Instagram, Meta Business, Google Ads, e-mail, banco, distribuidoras. Para lembrar de tudo, a senha se repete, e uma conta invadida vira dez.',
      },
      {
        title: 'A senha circula em print e mensagem',
        body: 'Anotação no celular, Drive compartilhado, conversa antiga. Quem tem acesso a isso tem acesso a tudo, e ninguém sabe quem ainda vê.',
      },
      {
        title: 'Senha sozinha já não basta',
        body: 'Conta sequestrada na véspera de uma campanha, perfil clonado, código de SMS interceptado. O que protege é a senha mais um segundo fator de verdade.',
      },
    ],
  },

  features: {
    kicker: 'Recursos',
    title: 'Tudo o que um cofre de senhas precisa ter, e o que o torna seguro de verdade',
    lead: 'Cada item abaixo já está no ar e faz parte da assinatura.',
    items: [
      {
        title: 'Cofre cifrado de ponta a ponta',
        body: 'Criptografia Argon2id e XChaCha20-Poly1305 no navegador. Cada item é cifrado antes de sair do seu aparelho.',
      },
      {
        title: 'Código de acesso por e-mail',
        body: 'Em cada acesso enviamos 6 dígitos para o seu e-mail. Nada de instalar aplicativo de verificação: se você lê o e-mail, você entra.',
      },
      {
        title: 'Digital do aparelho',
        body: 'Cadastre o Touch ID ou o Face ID e abra o cofre sem digitar a palavra-passe.',
      },
      {
        title: 'App no celular',
        body: 'Instale na tela inicial do Android ou do iPhone e abra o cofre como qualquer aplicativo.',
      },
      {
        title: 'Códigos 2FA no cofre',
        body: 'Guarde o segredo do autenticador de outros serviços e veja o código ao vivo, ao lado da senha.',
      },
      {
        title: 'Entrada nos apps da Astrał wave',
        body: 'Uma conta só para entrar nos sistemas que usam o LoginHUB, com o mesmo segundo fator.',
      },
      {
        title: 'Trocou de celular? Sem drama',
        body: 'Como o código chega ao seu e-mail, um aparelho novo entra normalmente. O cofre segue trancado pela sua palavra-passe.',
      },
      {
        title: 'Tecnologia em produção',
        body: 'O mesmo LoginHUB já protege o login de sistemas reais, com sessões, aparelhos e bloqueios de acesso.',
      },
    ],
  },

  // Seção das telas do app + instalação no celular. As imagens são desenhadas
  // na própria página (nenhum dado real do cofre aparece nelas).
  showcase: {
    kicker: 'O app',
    title: 'Veja como é por dentro, e instale no seu celular',
    lead:
      'O LoginHUB abre no navegador e se instala como app. Sem loja, sem download pesado: é um toque para ter o cofre na tela inicial.',
    screens: [
      { caption: 'Entrada com código por e-mail' },
      { caption: 'Meu cofre, só seu' },
      { caption: 'Código 2FA ao vivo' },
    ],
    login: {
      title: 'Entrar',
      field: 'Código recebido por e-mail',
      hint: 'Abra o e-mail que enviamos e digite os 6 dígitos.',
      button: 'Confirmar',
    },
    vault: {
      title: 'Meu cofre',
      lock: 'Cifrado neste aparelho',
      entries: ['Instagram @suamarca', 'Meta Business Suite', 'Google Ads', 'Banco · acesso PJ'],
    },
    code: {
      title: 'Google Ads',
      user: 'contato@suamarca.com',
      label: 'Código 2FA',
      renews: 'renova em 18 s',
    },
    install: {
      title: 'Instale em 3 toques',
      lead: 'O mesmo endereço do app, instalado como aplicativo:',
      open: 'Abrir o LoginHUB',
      android: {
        name: 'Android (Chrome)',
        steps: [
          'Abra loginhub.astralwavelabel.com no Chrome.',
          'Toque em Instalar quando o aviso aparecer (ou no menu ⋮ → Instalar app).',
          'Abra o ícone LoginHUB na tela inicial.',
        ],
      },
      ios: {
        name: 'iPhone e iPad (Safari)',
        steps: [
          'Abra loginhub.astralwavelabel.com no Safari.',
          'Toque em Compartilhar e depois em Adicionar à Tela de Início.',
          'Abra o ícone LoginHUB na tela inicial.',
        ],
      },
    },
  },

  trust: {
    title: 'Já protege o login de sistemas reais',
    apps: ['Astrał wave Label', 'MoneyAPP', 'Sul Alimentos', 'Escritórios 3D', 'MovingUP'],
  },

  highlights: [
    {
      id: 'vault',
      kicker: 'Cofre',
      title: 'Todas as suas senhas em um lugar que só você abre',
      body: 'Guarde logins, códigos de recuperação e notas. Tudo é cifrado no seu aparelho antes de sair dele, então o que fica no nosso servidor é texto ilegível.',
      points: ['Cifra Argon2id + XChaCha20-Poly1305', 'Gerador de senhas fortes', 'Vários cofres, um para cada assunto'],
    },
    {
      id: 'totp',
      kicker: 'Segundo fator',
      title: 'Código no e-mail em todo acesso, sem app extra',
      body: 'Senha sozinha não entra: toda entrada confirma um código de 6 dígitos enviado ao seu e-mail (uso único, vale 5 minutos). E o cofre ainda guarda os códigos 2FA dos seus outros serviços ao lado da senha.',
      points: ['Sem Google Authenticator nem outro aplicativo', 'Código ao vivo dentro do cofre', 'Quer mais segurança? Ative o autenticador por conta própria'],
    },
    {
      id: 'share',
      kicker: 'Compartilhar',
      title: 'Compartilhe uma senha sem mandá-la por mensagem',
      body: 'Escolha o cofre, digite o e-mail de quem vai receber e defina se a pessoa só vê ou também edita. A chave viaja cifrada para o destinatário e nem a Astrał wave consegue lê-la.',
      points: ['Leitura ou edição, por pessoa', 'Código de verificação para conferir quem recebe', 'Ao remover alguém, a chave do cofre é trocada'],
    },
    {
      id: 'phone',
      kicker: 'No celular',
      title: 'O cofre na tela inicial do seu celular',
      body: 'O LoginHUB se instala como app no Android e no iPhone. Abra com a digital, copie a senha e volte ao que estava fazendo.',
      points: ['Instalação em três toques, sem loja de aplicativos', 'Touch ID e Face ID', 'O mesmo cofre no computador e no celular'],
    },
  ],

  faq: {
    kicker: 'Dúvidas frequentes',
    title: 'O que as pessoas perguntam antes de assinar',
    items: [
      {
        q: 'Vocês conseguem ver as minhas senhas?',
        a: 'Não. A cifra acontece no seu navegador, com uma chave que nunca enviamos. No nosso servidor existe só texto cifrado.',
      },
      {
        q: 'E se eu esquecer a palavra-passe do cofre?',
        a: 'Você usa o kit de recuperação que recebe ao criar o cofre. Sem a palavra-passe e sem o kit ninguém consegue abrir o cofre, nem a gente: é o preço de ninguém mais poder entrar.',
      },
      {
        q: 'Perdi o celular. E agora?',
        a: 'Entre normalmente em outro aparelho: o código de acesso chega ao seu e-mail. O cofre continua trancado pela sua palavra-passe, que só você sabe.',
      },
      {
        q: 'Como funciona o pagamento?',
        a: 'R$ 24,99 por mês, no cartão de crédito, pelo Mercado Pago. Para cancelar ou trocar o cartão, fale com a gente.',
      },
      {
        q: 'Funciona no iPhone?',
        a: 'Sim. Abra loginhub.astralwavelabel.com no Safari, toque em Compartilhar e em Adicionar à Tela de Início.',
      },
      {
        q: 'Posso dar acesso a uma senha para outra pessoa?',
        a: 'Pode. Você compartilha um cofre pelo e-mail da pessoa, define se ela só lê ou também edita, e confere o código de verificação para ter certeza de quem recebe.',
      },
    ],
  },

  how: {
    kicker: 'Como funciona',
    title: 'Três passos, e o cofre está no seu bolso',
    steps: [
      {
        title: 'Assine',
        body: 'Preencha nome, e-mail e telefone e pague no cartão pelo Mercado Pago. A cobrança de R$ 24,99 é mensal e automática.',
      },
      {
        title: 'Defina a senha e entre',
        body: 'Pelo link que chega no seu e-mail você define a senha. Nos acessos seguintes, um código de 6 dígitos enviado ao e-mail confirma que é você.',
      },
      {
        title: 'Abra o cofre e instale o app',
        body: 'Escolha a sua palavra-passe, guarde as primeiras senhas e instale o LoginHUB na tela inicial do celular.',
      },
    ],
  },

  security: {
    kicker: 'Segurança',
    title: 'Um serviço de senhas que não vira o próprio risco',
    lead: 'Quem guarda senhas tem de aceitar regras mais duras que a média.',
    items: [
      {
        title: 'Não lemos o seu cofre',
        body: 'A cifra acontece no seu navegador, com uma chave que não enviamos. Para a Astrał wave, o conteúdo do cofre é ilegível.',
      },
      {
        title: 'Segundo fator em toda conta',
        body: 'Todo acesso confirma um código enviado ao e-mail da conta. O código vale 5 minutos, 5 tentativas e uso único.',
      },
      {
        title: 'Sem celular de reserva',
        body: 'Como o código vai para o e-mail, perder o celular não tranca a conta: basta abrir o e-mail em outro aparelho.',
      },
      {
        title: 'Sessões e aparelhos registrados',
        body: 'O LoginHUB registra os aparelhos de cada conta e bloqueia tentativas repetidas de acesso.',
      },
    ],
  },

  pricing: {
    kicker: 'Assinatura',
    title: 'Um plano só, por R$ 24,99 ao mês.',
    lead: 'Cobrança mensal automática no cartão. Sem taxa de adesão e sem recurso essencial cobrado à parte.',
    plans: [
      {
        name: 'LoginHUB',
        // ATENÇÃO: este valor é só texto. Quem cobra é o plano do app LoginHUB
        // (id 28) no LoginHUB: planos_app.valor. Mudar um sem o outro faz a página
        // anunciar um preço e o Mercado Pago cobrar outro.
        price: 'R$ 24,99',
        period: 'por mês',
        highlight: true,
        badge: 'Tudo incluído',
        features: [
          'Cofre de senhas cifrado de ponta a ponta',
          'Código de acesso por e-mail em todo acesso, sem app extra',
          'Abertura pela digital (Touch ID e Face ID)',
          'Códigos 2FA guardados no cofre',
          'App instalável no Android e no iPhone',
          'Perdeu o celular? Entre por outro aparelho com o código do e-mail',
        ],
        cta: 'Assinar agora',
      },
    ],
    note:
      'Cobrança mensal no cartão de crédito, processada pelo Mercado Pago. Para cancelar ou trocar o cartão, fale com a gente.',
  },

  form: {
    title: 'Seus dados',
    subtitle:
      'Três campos. É com eles que criamos o seu acesso e enviamos o link para cadastrar a senha.',
    fields: {
      nome: {
        label: 'Nome completo',
        placeholder: 'Marina Duarte',
        error: 'Informe nome e sobrenome.',
      },
      email: {
        label: 'E-mail de acesso',
        placeholder: 'voce@suaempresa.com',
        error: 'E-mail inválido.',
      },
      telefone: {
        label: 'Telefone ou WhatsApp',
        placeholder: '(11) 98888-7777',
        error: 'Informe DDD e número.',
      },
    },
    privacy:
      'Usamos esses dados só para criar o seu acesso e cobrar a assinatura. Não compartilhamos com ninguém.',
    submit: 'Ir para o pagamento',
  },

  checkout: {
    loading: 'Abrindo o pagamento…',
    error: 'Não foi possível abrir o pagamento agora. Tente de novo em instantes ou fale com a gente.',
    errorDuplicate: 'Este e-mail já tem uma assinatura ou conta. Entre no LoginHUB com ele.',
    secure: 'Pagamento processado pelo Mercado Pago · cartão de crédito',
  },

  payment: {
    approved: {
      title: 'Assinatura ativa',
      body: 'Pagamento confirmado. Enviamos o link de acesso para o seu e-mail: com ele você define a senha e já pode entrar.',
    },
    pending: {
      title: 'Confirmando o pagamento',
      body: 'O Mercado Pago ainda está processando o cartão. Assim que aprovar, você recebe o e-mail com o link de acesso.',
    },
    error: {
      title: 'Pagamento não concluído',
      body: 'Nada foi cobrado. Você pode tentar de novo pelo botão de assinatura.',
    },
    enter: 'Entrar no LoginHUB',
    dismiss: 'Fechar aviso',
  },

  finalCta: {
    title: 'Pare de guardar a sua vida digital em lugares que qualquer um abre',
    body: 'Por R$ 24,99 por mês você tem um cofre que só você abre, protegido por código enviado ao seu e-mail, no computador e no celular.',
    buy: 'Assinar agora',
    contact: 'Falar com a gente',
  },

  footer: {
    tagline:
      'LoginHUB — Technology Astrał wave. Cofre de senhas e login seguro, com código de acesso enviado ao seu e-mail.',
    product: 'LoginHUB',
    company: 'Astrał wave',
    legal: 'Legal',
    links: {
      features: 'Recursos',
      pricing: 'Assinatura',
      app: 'Entrar no LoginHUB',
      label: 'Astrał wave Label',
      store: 'Loja Track',
      artist: 'Painel do artista',
      contact: 'Contato',
      privacy: 'Política de privacidade',
      terms: 'Termos de uso',
    },
    badge: 'Feito com Vue.js + Docker — Astrał wave',
    rights: 'Todos os direitos reservados.',
  },
}

export type Messages = typeof ptBR
export default ptBR
