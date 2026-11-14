// Voice answers with the browser's MediaRecorder. The recording itself is the answer, so voice input
// works offline and needs no outside speech service. (Speech-to-text is an optional server feature.)

export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private started = 0;

  static supported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  }

  get recording(): boolean {
    return this.rec?.state === 'recording';
  }

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.rec = new MediaRecorder(stream);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.started = Date.now();
    this.rec.start();
  }

  stop(): Promise<{ blob: Blob; seconds: number }> {
    return new Promise((resolve) => {
      const rec = this.rec!;
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        resolve({ blob: new Blob(this.chunks, { type: rec.mimeType }), seconds: Math.max(1, Math.round((Date.now() - this.started) / 1000)) });
      };
      rec.stop();
    });
  }
}
