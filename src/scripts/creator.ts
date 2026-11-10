import { SITE } from '../site';
import { ICONS } from '../icons';

/*
 * Mise en avant discrète du créateur :
 *  - pendant une attente réelle (chargement, génération), une ligne sous l'indicateur ;
 *  - après un résultat utile, un encart refermable, masqué 14 jours une fois fermé.
 * Jamais de fenêtre modale, jamais de délai artificiel.
 */

const HIDE_KEY = 'fxt:merci-masque-jusqua';
const HIDE_DAYS = 14;
const first = SITE.author.split(' ')[0];
const ext = 'target="_blank" rel="me noopener"';

const WAIT_LINES = [
  `Cet outil est gratuit et open source, fait par ${first}. <a href="${SITE.linkedin}" ${ext}>Suivez-le sur LinkedIn</a> pour les prochains.`,
  `Vous aimez les outils sans pub et sans compte ? ${first} en publie d’autres sur <a href="${SITE.linkedin}" ${ext}>LinkedIn</a>.`,
  `Rien n’est envoyé sur internet, tout tourne ici. Les coulisses du projet sont sur <a href="${SITE.linkedin}" ${ext}>LinkedIn</a> et <a href="${SITE.instagram}" ${ext}>Instagram</a>.`,
];

export function waitCard(label: string): string {
  const line = WAIT_LINES[Math.floor(Math.random() * WAIT_LINES.length)];
  return `<div class="wait-card" role="status"><span class="spinner" aria-hidden="true"></span>
    <div><p><strong>${label}</strong></p><p class="wait-sub">${line}</p></div></div>`;
}

export function thanksAllowed(): boolean {
  try {
    return Number(localStorage.getItem(HIDE_KEY) ?? 0) < Date.now();
  } catch {
    return true;
  }
}

export function thanksCard(kind: 'analyse' | 'conversion'): string {
  if (!thanksAllowed()) return '';
  const text =
    kind === 'conversion'
      ? `<strong>Votre fichier est prêt.</strong> Cet outil est gratuit et le restera. Pour soutenir le projet, le plus simple est de suivre ${first} sur LinkedIn.`
      : `<strong>Ce contrôle vous a été utile ?</strong> ${first} publie d’autres outils gratuits pour les comptables et les entreprises sur LinkedIn.`;
  return `<div class="thanks" data-thanks>
    <p>${text}<span class="more">Aussi sur <a href="${SITE.instagram}" ${ext}>Instagram</a> · <a href="${SITE.portfolio}" ${ext}>portfolio</a> · <a href="${SITE.repo}" ${ext}>GitHub</a></span></p>
    <a class="btn-linkedin small" href="${SITE.linkedin}" ${ext}>${ICONS.linkedin}Suivre sur LinkedIn</a>
    <button type="button" class="close" aria-label="Masquer ce message" data-thanks-close>×</button>
  </div>`;
}

/** Branche le bouton de fermeture : l'encart disparaît partout pendant 14 jours. */
export function bindThanks(root: ParentNode) {
  root.querySelectorAll<HTMLButtonElement>('[data-thanks-close]').forEach((btn) =>
    btn.addEventListener('click', () => {
      try {
        localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_DAYS * 86400000));
      } catch {
        /* stockage indisponible : on masque seulement pour cette page */
      }
      btn.closest('[data-thanks]')?.remove();
    }),
  );
}
