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
}