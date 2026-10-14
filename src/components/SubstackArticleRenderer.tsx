"use client";

import Image from "next/image";
import { useState } from "react";
import { MARCA } from "@/lib/marca";
import { enderecoDaPaginaAtual, linkDoWhatsApp } from "@/lib/compartilhar";
import { recorteDaFoto } from "@/lib/imagem-da-capa";

type SubstackArticleRendererProps = {
  title: string;
  subtitle?: string;
  date?: string;
  /** A data de publicação em ISO, para o `<time>`: a mesma do `datePublished`. */
  dateTime?: string;
  /** "Atualizado em", só quando a modificação honesta cai em outro dia. */
  updated?: string;
  updatedTime?: string;
  category?: string;
  /** A página da editoria: o chapéu vira o caminho de navegação visível. */
  categoryHref?: string;
  readTime?: string;
  coverImage?: string | null;
  /** O crédito da foto da capa, que a licença CC BY exige visível junto da obra. */
  coverCredit?: string | null;
  /** Link do crédito (a página do arquivo no Commons, quando não há crédito gravado). */
  coverCreditHref?: string | null;
  /**
   * O que a foto da capa mostra, em uma frase: vai para o `alt` e abre a
   * legenda visível. Sem ela, o `alt` cai no título, como era.
   */
  coverDescription?: string | null;
  /**
   * O `alt` da capa, quando ele não deve ser a legenda (06/10/2026): a legenda
   * neutra ("Imagem ilustrativa: assunto.") não descreve a foto, e aí o `alt`
   * fica no título, como era.
   */
  coverAlt?: string | null;
  /** O endereço canônico da matéria, só para o link de compartilhar sem JavaScript. */
  shareUrl?: string;
  /** Os assuntos da matéria, na fileira do fim. Texto puro: ainda não há página de assunto. */
  topics?: string[];
  contentHtml?: string;
  sections?: Array<{ heading: string; paragraphs: string[] }>;
  quote?: string;
  quoteBy?: string;
  author?: string;
  /**
   * O autor cadastrado (06/10/2026): a assinatura vira link para a página
   * dele, com a foto pequena quando há. Ausente, vale `author`, que é a
   * Redação para tudo o que a esteira publica.
   */
  autor?: { nome: string; href: string; foto?: string | null } | null;
};

export function SubstackArticleRenderer({
  title,
  subtitle,
  date,
  dateTime,
  updated,
  updatedTime,
  category = "Notícias",
  categoryHref,
  readTime,
  coverImage,
  coverCredit,
  coverCreditHref,
  coverDescription,
  coverAlt,
  shareUrl,
  topics,
  contentHtml,
  sections,
  quote,
  quoteBy = MARCA.nome,
  author = MARCA.nome,
  autor,
}: SubstackArticleRendererProps) {
  const [pollVoted, setPollVoted] = useState<string | null>(null);

  // O href do servidor leva o canônico, para quem está sem JavaScript; o clique
  // troca pelo endereço que o navegador está mostrando (ver `compartilhar.ts`).
  const whatsappShareUrl = linkDoWhatsApp(MARCA.nome, title, shareUrl ?? MARCA.site);
  const legendaDaCapa = [coverDescription?.trim(), coverCredit?.trim()].filter(Boolean) as string[];

  /*
   * Sem data e sem tempo de leitura inventados. Até 05/10/2026 a página caía
   * em "20 de Agosto de 2026" quando o registro não tinha data, e em "5 min"
   * quando não tinha tempo: dois números que pareciam medidos e não eram.
   * Quem não tem o dado não imprime a linha.
   */
  const assinatura = author === MARCA.nome ? `Redação ${MARCA.nome}` : author;

  return (
    <article className="mx-auto max-w-[680px] bg-white py-6 text-[#0A0A0A]">
      {/* 1. Cabeçalho */}
      <header>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-[0.16em]">
          {categoryHref ? (
            <a href={categoryHref} className="rounded-sm bg-[var(--portal-vermelho)] px-3 py-1 text-white hover:underline">
              {category}
            </a>
          ) : (
            <span className="rounded-sm bg-[var(--portal-vermelho)] px-3 py-1 text-white">{category}</span>
          )}
          {readTime ? <span className="text-[#71717A]">{readTime} de leitura</span> : null}
        </div>

        <h1 className="mt-4 text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#0A0A0A] sm:text-[40px]">
          {title}
        </h1>

        {subtitle ? (
          <p className="mt-4 text-[17px] leading-relaxed text-[#52525B] sm:text-lg">{subtitle}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-y border-[#F4F4F5] py-4">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[#71717A]">
            {autor ? (
              <span className="inline-flex items-center gap-2">
                {autor.foto ? (
                  // Foto do autor por <img>: o endereço é colado no painel e pode vir de qualquer host.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={autor.foto}
                    alt=""
                    width={28}
                    height={28}
                    className="h-7 w-7 rounded-full object-cover"
                    loading="lazy"
                  />
                ) : null}
                <span>
                  Por{" "}
                  <a href={autor.href} rel="author" className="text-[#0A0A0A] underline-offset-4 hover:underline">
                    {autor.nome}
                  </a>
                </span>
              </span>
            ) : (
              <span>Por {assinatura}</span>
            )}
            {date ? (
              <>
                <span aria-hidden="true" className="hidden h-1 w-1 rounded-full bg-[#D4D4D8] sm:inline-block" />
                {dateTime ? <time dateTime={dateTime}>{date}</time> : <span>{date}</span>}
              </>
            ) : null}
            {updated ? (
              <>
                <span aria-hidden="true" className="hidden h-1 w-1 rounded-full bg-[#D4D4D8] sm:inline-block" />
                <span>
                  Atualizado em {updatedTime ? <time dateTime={updatedTime}>{updated}</time> : updated}
                </span>
              </>
            ) : null}
          </p>

          <a
            href={whatsappShareUrl}
            onClick={(e) => {
              e.currentTarget.href = linkDoWhatsApp(MARCA.nome, title, enderecoDaPaginaAtual(window.location));
            }}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E4E4E7] px-4 py-2 text-xs font-semibold text-[#0A0A0A] transition-colors hover:border-[#0A0A0A]"
          >
            <span>Compartilhar no WhatsApp</span>
          </a>
        </div>
      </header>

      {/* 2. Capa, em caixa de proporção fixa */}
      {coverImage ? (
        <figure className="mb-0 mt-8">
          {/*
            A foto vai INTEIRA (14/10/2026). A caixa é 16:9 e o retrato é
            vertical: recortada, a capa mostrava 40% da altura e cortava o
            queixo ou o alto da cabeça (Nadella, Zuckerberg). Agora a foto
            fica contida, e a sobra dos lados é a própria foto ampliada e
            desfocada, que é decorativa e some para o leitor de tela.
          */}
          <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-[#F4F4F5]">
            <Image
              alt=""
              aria-hidden="true"
              src={coverImage}
              fill
              sizes="(min-width: 768px) 680px, 100vw"
              className={`scale-110 object-cover ${recorteDaFoto(coverImage).classe} blur-2xl brightness-90`}
            />
            <Image
              alt={coverAlt?.trim() || coverDescription?.trim() || title}
              src={coverImage}
              fill
              sizes="(min-width: 768px) 680px, 100vw"
              preload
              className="object-contain"
            />
          </div>
          {legendaDaCapa.length ? (
            <figcaption className="mt-2 text-xs leading-relaxed text-[#71717A]">
              {coverDescription?.trim() ? <span className="text-[#52525B]">{coverDescription.trim()}</span> : null}
              {coverDescription?.trim() && coverCredit?.trim() ? <span aria-hidden="true"> · </span> : null}
              {coverCredit?.trim() ? (
                coverCreditHref ? (
                  <a href={coverCreditHref} target="_blank" rel="noopener noreferrer" className="underline">
                    {coverCredit.trim()}
                  </a>
                ) : (
                  <span>{coverCredit.trim()}</span>
                )
              ) : null}
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      {/* 3. Destaque de Citação */}
      {quote ? (
        <blockquote className="my-8 rounded-r-xl border-l-4 border-[var(--portal-vermelho)] bg-[#FAFAFA] p-5 text-lg text-[#18181B]">
          <p>{`"${quote}"`}</p>
          <footer className="mt-2 text-xs font-semibold text-[#71717A]">
            {quoteBy}
          </footer>
        </blockquote>
      ) : null}

      {/* 4. Corpo do Artigo em HTML Fluido ou Seções */}
      {contentHtml && contentHtml.trim().length > 0 ? (
        <div
          className="artigo-corpo mb-0 mt-8 max-w-none text-base leading-relaxed text-[#27272A]"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      ) : (
        <div className="my-6 space-y-8">
          {sections?.map((sec, idx) => (
            <section key={idx} className="space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight text-[#0A0A0A]">{sec.heading}</h2>
              <div className="space-y-4 text-base leading-relaxed text-[#374151]">
                {sec.paragraphs.map((p, pIdx) => (
                  <p key={pIdx}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* 5. Assuntos: texto puro até existir página de assunto (decisão para depois). */}
      {topics && topics.length > 0 ? (
        <section aria-labelledby="assuntos-da-materia" className="mt-10 border-t border-[#F4F4F5] pt-5">
          <h2 id="assuntos-da-materia" className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#71717A]">
            Assuntos
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {topics.map((t) => (
              <li key={t} className="rounded-full border border-[#E4E4E7] px-3 py-1 text-xs font-medium text-[#3F3F46]">
                {t}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 6. Módulo de Interação de Leitura */}
      <div className="my-10 border-t border-b border-[#f3f4f6] py-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">
          O que você achou desta matéria?
        </p>

        {pollVoted ? (
          <div className="mt-3 rounded-lg bg-[#f0fdf4] p-3 text-xs font-semibold text-[#166534]">
            Obrigado pela sua opinião! ({pollVoted})
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-medium">
            <button
              onClick={() => setPollVoted("Excelente")}
              className="rounded-full border border-[#e5e7eb] bg-white px-4 py-1.5 text-[#374151] hover:border-[#E4344A] hover:bg-[#FDECEE] transition-colors"
            >
              💡 Excelente
            </button>
            <button
              onClick={() => setPollVoted("Útil")}
              className="rounded-full border border-[#e5e7eb] bg-white px-4 py-1.5 text-[#374151] hover:border-[#E4344A] hover:bg-[#FDECEE] transition-colors"
            >
              👍 Útil
            </button>
            <button
              onClick={() => setPollVoted("Pode melhorar")}
              className="rounded-full border border-[#e5e7eb] bg-white px-4 py-1.5 text-[#374151] hover:border-[#E4344A] hover:bg-[#FDECEE] transition-colors"
            >
              🤔 Pode melhorar
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
