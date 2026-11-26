// Destinos externos num lugar só. Trocar aqui muda a LP inteira.
//
// O app do LoginHUB (cofre e login) é este endereço: quem assina entra por ele e
// é nele que o PWA se instala no celular. Não há URL de download nem de
// documentação pública, e `docs.astralwavelabel.com` não existe.
export const LOGINHUB_URL = 'https://loginhub.astralwavelabel.com/'
// O app completo (painel e cofre): o botão Entrar da LP abre a tela de login do hub, no mesmo host.
export const LOGIN_URL = '/login'
export const LABEL_URL = 'https://astralwavelabel.com/'
// A loja é o Track, em subdomínio próprio. Até 28/09/2026 apontava para a
// label, o que mandava o visitante ao lugar errado com o rótulo "Loja".
export const STORE_URL = 'https://track.astralwavelabel.com/'
export const ARTIST_URL = 'https://artist.astralwavelabel.com/'
// A label ganhou página de contato própria (formulário + WhatsApp); um mailto
// abria o cliente de e-mail do sistema, que em celular quase nunca está
// configurado.
export const CONTACT_URL = 'https://astralwavelabel.com/contact'
export const PRIVACY_URL = '/privacidade'
export const TERMS_URL = '/termos'

// Os produtos da Astrał wave, na ordem em que o seletor do cabeçalho mostra.
// Nomes e descrições ficam no i18n (products.*); aqui só id e destino. O mesmo
// conteúdo existe no site (apps/site/src/lib/links.ts) e na loja
// (apps/track/src/components/ProdutosMenu.vue) — mudou lá, mude aqui.
export type ProdutoId = 'label' | 'track' | 'security' | 'artist'
export const PRODUCTS: ReadonlyArray<{ id: ProdutoId; url: string }> = [
  { id: 'label', url: LABEL_URL },
  { id: 'track', url: STORE_URL },
  { id: 'security', url: '#topo' },
  { id: 'artist', url: ARTIST_URL },
]
