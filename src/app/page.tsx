/** "/" → manda a cada persona a su pantalla según su rol. */
import { redirect } from "next/navigation";
import { inicioSegunRol, obtenerPerfil } from "@/lib/auth";

export default async function Inicio() {
  const perfil = await obtenerPerfil();
  redirect(perfil ? inicioSegunRol(perfil) : "/login");
}
