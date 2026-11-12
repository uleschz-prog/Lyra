"use client";

import { CalendarDays, Clock3, MapPin, Video } from "lucide-react";
import { useRef } from "react";

import {
  cancelAcademyEventRsvp,
  createAcademyEvent,
  deleteAcademyEvent,
  rsvpToAcademyEvent,
} from "@/app/dashboard/academy/events/actions";

export type CommunityEventData = {
  id: string;
  title: string;
  description: string;
  startsAt: Date;
  durationMinutes: number;
  location: string | null;
  meetingUrl: string | null;
  attendeeCount: number;
  attending: boolean;
};

function formatEventDate(date: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function EventCreateForm() {
  const localDateRef = useRef<HTMLInputElement>(null);
  const utcDateRef = useRef<HTMLInputElement>(null);

  return (
    <form
      action={createAcademyEvent}
      onSubmit={() => {
        const localDate = localDateRef.current?.value;
        if (localDate && utcDateRef.current) utcDateRef.current.value = new Date(localDate).toISOString();
      }}
      className="mb-5 grid gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 sm:grid-cols-2 sm:p-5"
    >
      <div className="sm:col-span-2">
        <h3 className="text-sm font-semibold text-[#312F2F]">Crear un evento</h3>
        <p className="mt-1 text-xs text-[#77716A]">La fecha se tomará de la zona horaria de tu dispositivo.</p>
      </div>
      <input
        name="title"
        required
        maxLength={120}
        placeholder="Título del evento"
        className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-[#1E1E24] outline-none focus:border-violet-400"
      />
      <input
        ref={localDateRef}
        type="datetime-local"
        required
        aria-label="Fecha y hora del evento"
        className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-[#1E1E24] outline-none focus:border-violet-400"
      />
      <input ref={utcDateRef} type="hidden" name="startsAtUtc" />
      <textarea
        name="description"
        required
        maxLength={2000}
        rows={2}
        placeholder="Descripción"
        className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-[#1E1E24] outline-none focus:border-violet-400 sm:col-span-2"
      />
      <div className="grid gap-3 sm:grid-cols-3 sm:col-span-2">
        <label className="grid gap-1 text-xs text-[#77716A]">
          Duración (minutos)
          <input name="durationMinutes" type="number" min={15} max={1440} defaultValue={60} required className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-[#1E1E24]" />
        </label>
        <label className="grid gap-1 text-xs text-[#77716A]">
          Lugar (opcional)
          <input name="location" maxLength={160} placeholder="Ej. En línea" className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-[#1E1E24]" />
        </label>
        <label className="grid gap-1 text-xs text-[#77716A]">
          Enlace (opcional)
          <input name="meetingUrl" type="url" maxLength={500} placeholder="https://" className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-[#1E1E24]" />
        </label>
      </div>
      <div className="sm:col-span-2">
        <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800">
          <CalendarDays size={16} aria-hidden="true" />Publicar evento
        </button>
      </div>
    </form>
  );
}

export function CommunityEvents({
  events,
  isAdmin,
}: {
  events: CommunityEventData[];
  isAdmin: boolean;
}) {
  return (
    <section className="mb-12" aria-labelledby="academy-events-title">
      <div className="mb-5">
        <p className="text-sm font-medium text-violet-700">Aprende junto a la comunidad</p>
        <h2 id="academy-events-title" className="mt-1 text-2xl font-semibold text-[#1E1E24]">Eventos y sesiones</h2>
        <p className="mt-1 max-w-2xl text-sm text-[#6A6662]">Encuentros, talleres y actividades próximas de LYRA.</p>
      </div>

      {isAdmin ? <EventCreateForm /> : null}

      {events.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {events.map((event) => (
            <article id={`event-${event.id}`} key={event.id} className="scroll-mt-24 rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-800">
                  <CalendarDays size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold leading-snug text-[#1E1E24]">{event.title}</h3>
                  <p className="mt-1 text-xs capitalize text-violet-800">{formatEventDate(event.startsAt)}</p>
                </div>
                {isAdmin ? (
                  <form action={deleteAcademyEvent}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <button type="submit" className="rounded-lg px-2 py-1 text-xs text-[#8A8680] hover:bg-red-50 hover:text-red-700">Eliminar</button>
                  </form>
                ) : null}
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#625E59]">{event.description}</p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#77716A]">
                <span className="inline-flex items-center gap-1.5"><Clock3 size={14} aria-hidden="true" />{event.durationMinutes} min</span>
                {event.location ? <span className="inline-flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" />{event.location}</span> : null}
                <span>{event.attendeeCount} {event.attendeeCount === 1 ? "asistente" : "asistentes"}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                {event.meetingUrl ? (
                  <a href={event.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:text-violet-900">
                    <Video size={16} aria-hidden="true" />Ver enlace
                  </a>
                ) : <span />}
                {event.attending ? (
                  <form action={cancelAcademyEventRsvp}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <button type="submit" className="h-9 rounded-xl border border-border px-3 text-xs font-semibold text-[#625E59] hover:bg-white">Cancelar asistencia</button>
                  </form>
                ) : (
                  <form action={rsvpToAcademyEvent}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <button type="submit" className="h-9 rounded-xl bg-[#312F2F] px-4 text-xs font-semibold text-white hover:bg-violet-800">Asistiré</button>
                  </form>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
          <p className="font-medium text-[#312F2F]">Aún no hay eventos próximos</p>
          <p className="mt-1 text-sm text-[#77716A]">Cuando se programe el siguiente encuentro, aparecerá aquí.</p>
        </div>
      )}
    </section>
  );
}
