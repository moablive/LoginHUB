import type { Messages } from './pt-BR'

// `satisfies Messages` cobra a estrutura inteira do PT-BR: chave nova lá que não
// exista aqui é erro de compilação, não string faltando em produção.
const en = {
  meta: {
    title: 'LoginHUB — Technology Astrał wave',
    description:
      'The password vault and identity platform behind Astrał wave, now for you: end-to-end encrypted passwords, sign-in by a code sent to your e-mail (no extra app), fingerprint unlock and a phone app. R$ 24.99 per month.',
    ogLocale: 'en_US',
  },

  nav: {
    problem: 'The problem',
    features: 'Features',
    how: 'How it works',
    security: 'Security',
    pricing: 'Subscription',
    cta: 'Subscribe',
    menu: 'Open menu',
    theme: 'Toggle theme',
    lang: 'Change language',
    products: 'Menu',
    login: 'Sign in',
    app: 'The app',
  },

  products: {
    title: 'Everything Astrał wave does',
    here: 'you are here',
    label: { name: 'Astrał wave Label', desc: 'The label: artists, releases and demos.' },
    track: { name: 'Astrał wave Track', desc: 'WAV track store, paid by Pix, straight from the makers.' },
    security: { name: 'LoginHUB', desc: 'Password vault and secure login, with an access code sent to your e-mail.' },
    artist: { name: 'Artist panel', desc: 'Where the DJ follows releases, contracts and sales.' },
  },

  hero: {
    badge: 'Password vault and identity · R$ 24.99 per month',
    title: 'All your passwords in a vault even we cannot open',
    subtitle:
      'LoginHUB is the login and vault technology Astrał wave runs its own systems on, now in your hands. Passwords are encrypted on your device, sign-in is by a code sent to your e-mail, with no extra app, and the app installs on your phone.',
    ctaPrimary: 'Subscribe for R$ 24.99/month',
    ctaLogin: 'Sign in',
    ctaSecondary: 'See the app',
    stats: [
      { value: 'End to end', label: 'encrypted on your device' },
      { value: 'E-mail', label: 'Access code, no extra app' },
      { value: 'R$ 24.99', label: 'per month, by card' },
    ],
    vault: {
      label: 'My vault',
      status: '2FA on · encrypted on device',
      entries: [
        'Instagram @yourbrand',
        'Meta Business Suite',
        'Google Ads',
        'Recovery keys',
      ],
    },
  },

  problem: {
    kicker: 'The problem',
    title: 'Your password is everywhere except somewhere safe.',
    lead:
      'Browser, spreadsheet, notes app, WhatsApp message. If you work with social media, ads and platforms you pile up dozens of logins, and one leak is enough to bring the rest down.',
    cards: [
      {
        title: 'Twenty or thirty accounts, and one password for many',
        body: 'Instagram, Meta Business, Google Ads, e-mail, bank, distributors. To remember it all, passwords repeat, and one breached account becomes ten.',
      },
      {
        title: 'Passwords travel in screenshots and chats',
        body: 'A note on the phone, a shared Drive, an old conversation. Whoever reaches those reaches everything, and nobody knows who still can.',
      },
      {
        title: 'A password alone is not enough',
        body: 'An account hijacked the night before a campaign, a cloned profile, an intercepted SMS code. What protects you is the password plus a real second factor.',
      },
    ],
  },

  features: {
    kicker: 'Features',
    title: 'Everything a password vault needs, and what makes it truly secure',
    lead: 'Every item below is live and included in the subscription.',
    items: [
      {
        title: 'End-to-end encrypted vault',
        body: 'Argon2id and XChaCha20-Poly1305 encryption in the browser. Every item is encrypted before it leaves your device.',
      },
      {
        title: 'Access code by e-mail',
        body: 'Every sign-in sends 6 digits to your e-mail. No verification app to install: if you can read the e-mail, you get in.',
      },
      {
        title: 'Device fingerprint',
        body: 'Register Touch ID or Face ID and open the vault without typing the passphrase.',
      },
      {
        title: 'Phone app',
        body: 'Install it on the Android or iPhone home screen and open the vault like any other app.',
      },
      {
        title: '2FA codes in the vault',
        body: 'Store the authenticator secret of other services and see the live code next to the password.',
      },
      {
        title: 'Sign-in to Astrał wave apps',
        body: 'One account to enter the systems that use LoginHUB, with the same second factor.',
      },
      {
        title: 'New phone? No drama',
        body: 'Since the code arrives in your e-mail, a new device signs in normally. The vault stays locked by your passphrase.',
      },
      {
        title: 'Technology in production',
        body: 'The same LoginHUB already protects the login of real systems, with sessions, devices and access lockouts.',
      },
    ],
  },

  showcase: {
    kicker: 'The app',
    title: 'See what it looks like inside, and install it on your phone',
    lead:
      'LoginHUB opens in the browser and installs as an app. No store, no heavy download: one tap puts the vault on your home screen.',
    screens: [
      { caption: 'Sign-in with an e-mail code' },
      { caption: 'My vault, only yours' },
      { caption: 'Live 2FA code' },
    ],
    login: {
      title: 'Sign in',
      field: 'Code received by e-mail',
      hint: 'Open the e-mail we sent and type the 6 digits.',
      button: 'Confirm',
    },
    vault: {
      title: 'My vault',
      lock: 'Encrypted on this device',
      entries: ['Instagram @yourbrand', 'Meta Business Suite', 'Google Ads', 'Bank · business access'],
    },
    code: {
      title: 'Google Ads',
      user: 'contact@yourbrand.com',
      label: '2FA code',
      renews: 'renews in 18 s',
    },
    install: {
      title: 'Install in 3 taps',
      lead: 'The app’s own address, installed as an application:',
      open: 'Open LoginHUB',
      android: {
        name: 'Android (Chrome)',
        steps: [
          'Open loginhub.astralwavelabel.com in Chrome.',
          'Tap Install when the prompt shows (or menu ⋮ → Install app).',
          'Open the LoginHUB icon on your home screen.',
        ],
      },
      ios: {
        name: 'iPhone and iPad (Safari)',
        steps: [
          'Open loginhub.astralwavelabel.com in Safari.',
          'Tap Share, then Add to Home Screen.',
          'Open the LoginHUB icon on your home screen.',
        ],
      },
    },
  },

  trust: {
    title: 'Already protecting the login of real systems',
    apps: ['Astrał wave Label', 'MoneyAPP', 'Sul Alimentos', 'Escritórios 3D', 'MovingUP'],
  },

  highlights: [
    {
      id: 'vault',
      kicker: 'Vault',
      title: 'All your passwords in a place only you can open',
      body: 'Store logins, recovery codes and notes. Everything is encrypted on your device before it leaves, so what sits on our server is unreadable text.',
      points: ['Argon2id + XChaCha20-Poly1305 encryption', 'Strong password generator', 'Several vaults, one for each subject'],
    },
    {
      id: 'totp',
      kicker: 'Second factor',
      title: 'An e-mail code on every sign-in, no extra app',
      body: 'A password alone does not get in: every sign-in confirms a 6-digit code sent to your e-mail (single use, valid for 5 minutes). The vault also keeps the 2FA codes of your other services next to the password.',
      points: ['No Google Authenticator or other app', 'Live code inside the vault', 'Want more security? Turn on the authenticator yourself'],
    },
    {
      id: 'share',
      kicker: 'Sharing',
      title: 'Share a password without sending it in a message',
      body: 'Pick the vault, type the e-mail of whoever will receive it and choose whether they only view or also edit. The key travels encrypted to the recipient and not even Astrał wave can read it.',
      points: ['View or edit, per person', 'Verification code to confirm who receives', 'Removing someone rotates the vault key'],
    },
    {
      id: 'phone',
      kicker: 'On your phone',
      title: 'The vault on your phone’s home screen',
      body: 'LoginHUB installs as an app on Android and iPhone. Open it with your fingerprint, copy the password and go back to what you were doing.',
      points: ['Three-tap install, no app store', 'Touch ID and Face ID', 'The same vault on computer and phone'],
    },
  ],

  faq: {
    kicker: 'Frequently asked',
    title: 'What people ask before subscribing',
    items: [
      {
        q: 'Can you see my passwords?',
        a: 'No. Encryption happens in your browser, with a key we never send. Our server only holds ciphertext.',
      },
      {
        q: 'What if I forget the vault passphrase?',
        a: 'Use the recovery kit you receive when creating the vault. Without the passphrase and the kit nobody can open the vault, not even us: that is the price of no one else being able to get in.',
      },
      {
        q: 'I lost my phone. Now what?',
        a: 'Just sign in on another device: the access code arrives in your e-mail. The vault stays locked by your passphrase, which only you know.',
      },
      {
        q: 'How does payment work?',
        a: 'R$ 24.99 per month, on a credit card, through Mercado Pago. To cancel or change the card, talk to us.',
      },
      {
        q: 'Does it work on iPhone?',
        a: 'Yes. Open loginhub.astralwavelabel.com in Safari, tap Share and then Add to Home Screen.',
      },
      {
        q: 'Can I give someone else access to a password?',
        a: 'Yes. You share a vault by the person’s e-mail, choose whether they only read or also edit, and check the verification code to be sure who receives it.',
      },
    ],
  },

  how: {
    kicker: 'How it works',
    title: 'Three steps and the vault is in your pocket',
    steps: [
      {
        title: 'Subscribe',
        body: 'Fill in name, e-mail and phone and pay by card through Mercado Pago. The R$ 24.99 charge is monthly and automatic.',
      },
      {
        title: 'Set your password and sign in',
        body: 'The link in your e-mail lets you set the password. On later sign-ins, a 6-digit code sent to your e-mail confirms it is you.',
      },
      {
        title: 'Open the vault and install the app',
        body: 'Pick your passphrase, store your first passwords and install LoginHUB on your phone’s home screen.',
      },
    ],
  },

  security: {
    kicker: 'Security',
    title: 'A password service that does not become the risk itself',
    lead: 'Whoever stores passwords has to accept rules tougher than average.',
    items: [
      {
        title: 'We cannot read your vault',
        body: 'Encryption happens in your browser, with a key we never receive. To Astrał wave, the vault contents are unreadable.',
      },
      {
        title: 'Second factor on every account',
        body: 'Every sign-in confirms a code sent to the account e-mail. The code is valid for 5 minutes, 5 attempts and a single use.',
      },
      {
        title: 'No backup phone needed',
        body: 'Because the code goes to your e-mail, losing your phone does not lock the account: just open the e-mail on another device.',
      },
      {
        title: 'Sessions and devices recorded',
        body: 'LoginHUB records each account’s devices and blocks repeated access attempts.',
      },
    ],
  },

  pricing: {
    kicker: 'Subscription',
    title: 'One plan, for R$ 24.99 a month.',
    lead: 'Automatic monthly charge on your card. No setup fee and no essential feature billed separately.',
    plans: [
      {
        name: 'LoginHUB',
        // ATENÇÃO: este valor é só texto. Quem cobra é o plano do app LoginHUB
        // (id 28) no LoginHUB: planos_app.valor. Mudar um sem o outro faz a página
        // anunciar um preço e o Mercado Pago cobrar outro.
        price: 'R$ 24.99',
        period: 'per month',
        highlight: true,
        badge: 'All included',
        features: [
          'End-to-end encrypted password vault',
          'E-mail access code on every sign-in, no extra app',
          'Fingerprint unlock (Touch ID and Face ID)',
          '2FA codes stored in the vault',
          'Installable app on Android and iPhone',
          'Lost your phone? Sign in on another device with the e-mail code',
        ],
        cta: 'Subscribe now',
      },
    ],
    note:
      'Monthly charge on a credit card, processed by Mercado Pago. To cancel or change the card, talk to us.',
  },

  form: {
    title: 'Your details',
    subtitle:
      'Three fields. We use them to create your access and send the link to set your password.',
    fields: {
      nome: {
        label: 'Full name',
        placeholder: 'Marina Duarte',
        error: 'Enter first and last name.',
      },
      email: {
        label: 'Sign-in e-mail',
        placeholder: 'you@yourcompany.com',
        error: 'Invalid e-mail.',
      },
      telefone: {
        label: 'Phone or WhatsApp',
        placeholder: '(11) 98888-7777',
        error: 'Enter area code and number.',
      },
    },
    privacy:
      'We use these details only to create your access and charge the subscription. We share them with no one.',
    submit: 'Go to payment',
  },

  checkout: {
    loading: 'Opening payment…',
    error: 'We could not open the payment right now. Try again in a moment or talk to us.',
    errorDuplicate: 'This e-mail already has a subscription or account. Sign in to LoginHUB with it.',
    secure: 'Payment processed by Mercado Pago · credit card',
  },

  payment: {
    approved: {
      title: 'Subscription active',
      body: 'Payment confirmed. We sent the access link to your e-mail: with it you set the password and can sign in.',
    },
    pending: {
      title: 'Confirming payment',
      body: 'Mercado Pago is still processing the card. As soon as it is approved you get the e-mail with the access link.',
    },
    error: {
      title: 'Payment not completed',
      body: 'Nothing was charged. You can try again with the subscribe button.',
    },
    enter: 'Sign in to LoginHUB',
    dismiss: 'Dismiss notice',
  },

  finalCta: {
    title: 'Stop keeping your digital life where anyone can open it',
    body: 'For R$ 24.99 a month you get a vault only you can open, protected by a code sent to your e-mail, on computer and phone.',
    buy: 'Subscribe now',
    contact: 'Talk to us',
  },

  footer: {
    tagline:
      'LoginHUB — Technology Astrał wave. Password vault and secure login, with an access code sent to your e-mail.',
    product: 'LoginHUB',
    company: 'Astrał wave',
    legal: 'Legal',
    links: {
      features: 'Features',
      pricing: 'Subscription',
      app: 'Sign in to LoginHUB',
      label: 'Astrał wave Label',
      store: 'Track store',
      artist: 'Artist panel',
      contact: 'Contact',
      privacy: 'Privacy policy',
      terms: 'Terms of use',
    },
    badge: 'Built with Vue.js + Docker — Astrał wave',
    rights: 'All rights reserved.',
  },
} satisfies Messages

export default en
