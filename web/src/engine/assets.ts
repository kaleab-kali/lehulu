// Where recorded audio prompts (audio/<lang>/<step>.opus) and sign clips (sign/<step>.webm) live.
// Pages build: the site base. Library build on another site: next to lehulu.js on the Lehulu server.
export function assetsBase(): string {
  return import.meta.env.VITE_LIB ? new URL(/* @vite-ignore */ '.', import.meta.url).href : import.meta.env.BASE_URL;
}
