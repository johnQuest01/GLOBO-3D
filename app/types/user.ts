// app/types/user.ts
export interface UserProfileData {
  fullName: string;
  age: string;
  city: string;
  email: string;
  /**
   * Opcionais porque contas criadas antes do cadastro com senha não os têm —
   * o `userData` do localStorage é lido de volta como está, e exigir os campos
   * novos deslogaria essas pessoas sem motivo.
   */
  state?: string;
  country?: string;
  /**
   * O nome público, e o único pelo qual outra pessoa consegue te achar na
   * lupa do globo. Opcional pela mesma razão dos campos acima: conta criada
   * antes da busca existir não tem um, e exigir aqui a deslogaria.
   */
  nickname?: string;
}