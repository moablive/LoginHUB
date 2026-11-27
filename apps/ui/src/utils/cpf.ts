/** CPF com os dois dígitos verificadores certos e sem sequência repetida (mesma regra da API). */
export const cpfValido = (bruto: string): boolean => {
  const c = String(bruto ?? '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
};
