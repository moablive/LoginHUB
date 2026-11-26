// Máscaras e validação do formulário. Duplicam o que a API já valida, de
// propósito: aqui é conveniência (erro na hora, sem round-trip), lá é
// segurança. O front nunca é a última palavra — ver SecurityController.
export function apenasDigitos(v: string): string {
  return v.replace(/\D/g, '')
}

/** CPF até 11 dígitos, CNPJ a partir daí. A máscara troca sozinha. */
export function mascaraDocumento(v: string): string {
  const d = apenasDigitos(v).slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function mascaraTelefone(v: string): string {
  const d = apenasDigitos(v).slice(0, 11)
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

function digitosIguais(v: string): boolean {
  return /^(\d)\1+$/.test(v)
}

export function validarCpf(v: string): boolean {
  const d = apenasDigitos(v)
  if (d.length !== 11 || digitosIguais(d)) return false
  const calc = (ate: number) => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}

export function validarCnpj(v: string): boolean {
  const d = apenasDigitos(v)
  if (d.length !== 14 || digitosIguais(d)) return false
  const calc = (ate: number) => {
    let peso = ate - 7
    let soma = 0
    for (let i = 0; i < ate; i++) {
      soma += Number(d[i]) * peso
      peso = peso === 2 ? 9 : peso - 1
    }
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

export function documentoValido(v: string): boolean {
  const d = apenasDigitos(v)
  if (d.length === 11) return validarCpf(d)
  if (d.length === 14) return validarCnpj(d)
  return false
}

export function emailValido(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
}

export function telefoneValido(v: string): boolean {
  const d = apenasDigitos(v)
  return d.length >= 10 && d.length <= 11
}

export function nomeValido(v: string): boolean {
  return v.trim().length >= 3 && v.trim().split(/\s+/).length >= 2
}
