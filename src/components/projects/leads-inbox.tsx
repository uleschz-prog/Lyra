"use client";

import { CheckCheck, Download, Mail, MessageCircle, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  markAllLeadsReadAction,
  setLeadReadAction,
} from "@/app/dashboard/proyectos/lead-actions";
import type { LeadItem } from "@/lib/leads/queries";

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.length === 10 ? `52${digits}` : digits}`;
}

/** Bandeja de contactos de un sitio publicado. */
export function LeadsInbox({
  projectId,
  initial,
}: {
  projectId: string;
  initial: LeadItem[];
}) {
  const router = useRouter();
  const [leads, setLeads] = useState(initial);
  const [pending, startTransition] = useTransition();
  const unread = leads.filter((lead) => !lead.read).length;

  function toggle(lead: LeadItem) {
    const next = !lead.read;
    setLeads((current) =>
      current.map((item) =>
        item.id === lead.id ? { ...item, read: next } : item,
      ),
    );
    startTransition(async () => {
      const result = await setLeadReadAction(lead.id, next);
      if (!result.ok) {
        toast.error(result.error);
        setLeads((current) =>
          current.map((item) =>
            item.id === lead.id ? { ...item, read: lead.read } : item,
          ),
        );
      }
    });
  }

  function readAll() {
    startTransition(async () => {
      const result = await markAllLeadsReadAction(projectId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLeads((current) => current.map((item) => ({ ...item, read: true })));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[#5C5854] dark:text-[#C8C4D4]">
          {leads.length === 0
            ? "Sin contactos todavía"
            : `${leads.length} contacto${leads.length === 1 ? "" : "s"}${unread ? ` · ${unread} sin leer` : ""}`}
        </p>
        <div className="flex flex-wrap gap-2">
          {unread ? (
            <button
              type="button"
              disabled={pending}
              onClick={readAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-white px-3 py-2 text-xs font-medium text-[#1E1E24] hover:border-[#C4B5FD] disabled:opacity-50 dark:border-white/12 dark:bg-[#181625] dark:text-[#F2F0F7]"
            >
              <CheckCheck className="size-3.5" />
              Marcar todo como leído
            </button>
          ) : null}
          {leads.length ? (
            <a
              href={`/api/proyectos/${projectId}/contactos`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#7C3AED] bg-[#7C3AED] px-3 py-2 text-xs font-medium text-white hover:bg-[#6D28D9]"
            >
              <Download className="size-3.5" />
              Exportar CSV
            </a>
          ) : null}
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E7E2DA] bg-white p-8 text-center dark:border-white/12 dark:bg-[#181625]">
          <p className="text-sm font-medium text-[#1E1E24] dark:text-[#F2F0F7]">
            Aquí llegan los mensajes de tu sitio publicado
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-[#8A8680]">
            Cuando alguien llene un formulario en tu dirección /s/…, verás su
            nombre, sus datos y su mensaje. Los formularios de la vista previa o
            de una copia descargada no llegan aquí.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {leads.map((lead) => {
            const wa = lead.phone ? waLink(lead.phone) : null;
            const others = lead.fields.filter(
              (field) =>
                ![lead.name, lead.email, lead.phone, lead.message].includes(
                  field.value,
                ),
            );
            return (
              <li
                key={lead.id}
                className={`rounded-2xl border p-4 transition-colors ${
                  lead.read
                    ? "border-[#EEE9E2] bg-white dark:border-white/10 dark:bg-[#181625]"
                    : "border-[#DDD6FE] bg-[#FBFAFF] dark:border-[#7C3AED]/40 dark:bg-[#1E1A2E]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-[#1E1E24] dark:text-[#F2F0F7]">
                      {!lead.read ? (
                        <span
                          className="size-2 rounded-full bg-[#7C3AED]"
                          aria-label="Sin leer"
                        />
                      ) : null}
                      {lead.name ||
                        lead.email ||
                        lead.phone ||
                        "Contacto sin nombre"}
                    </p>
                    <p className="mt-0.5 text-xs text-[#8A8680]">
                      {dateFormat.format(new Date(lead.createdAt))} (CDMX)
                      {lead.versionNumber
                        ? ` · versión ${lead.versionNumber}`
                        : ""}
                      {lead.page && lead.page !== "/" ? ` · ${lead.page}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(lead)}
                    className="rounded-lg px-2.5 py-1.5 text-xs text-[#5C5854] hover:bg-[#F3F0EB] dark:text-[#C8C4D4] dark:hover:bg-white/10"
                  >
                    {lead.read ? "Marcar como no leído" : "Marcar como leído"}
                  </button>
                </div>
                {lead.message ? (
                  <p className="mt-2 text-sm whitespace-pre-wrap text-[#1E1E24] dark:text-[#ECEAF3]">
                    {lead.message}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {lead.email ? (
                    <a
                      href={`mailto:${lead.email}`}
                      className="inline-flex items-center gap-1 rounded-full bg-[#F3F0EB] px-2.5 py-1 text-xs text-[#1E1E24] hover:bg-[#EDE9FE] dark:bg-white/8 dark:text-white"
                    >
                      <Mail className="size-3" /> {lead.email}
                    </a>
                  ) : null}
                  {lead.phone ? (
                    <a
                      href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}
                      className="inline-flex items-center gap-1 rounded-full bg-[#F3F0EB] px-2.5 py-1 text-xs text-[#1E1E24] hover:bg-[#EDE9FE] dark:bg-white/8 dark:text-white"
                    >
                      <Phone className="size-3" /> {lead.phone}
                    </a>
                  ) : null}
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2.5 py-1 text-xs text-[#166534] hover:bg-[#BBF7D0] dark:bg-emerald-500/15 dark:text-emerald-300"
                    >
                      <MessageCircle className="size-3" /> Responder por
                      WhatsApp
                    </a>
                  ) : null}
                </div>
                {others.length ? (
                  <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                    {others.map((field, index) => (
                      <div key={`${field.label}-${index}`} className="min-w-0">
                        <dt className="text-[#8A8680]">{field.label}</dt>
                        <dd className="break-words text-[#1E1E24] dark:text-[#ECEAF3]">
                          {field.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
