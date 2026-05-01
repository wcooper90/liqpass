import { shortestArc } from './utils/geo';

export class CompassUI {
  private roseEl: HTMLElement;
  private needleEl: HTMLElement;
  private wrapperEl: HTMLElement;
  private prevRoseAngle = 0;
  private prevNeedleAngle = 0;

  constructor() {
    this.wrapperEl = document.getElementById('compass-wrapper') as HTMLElement;
    this.roseEl = document.getElementById('compass-rose') as HTMLElement;
    this.needleEl = document.getElementById('compass-needle') as HTMLElement;
    this.renderTicks();
  }

  private renderTicks() {
    const ticksEl = document.getElementById('rose-ticks')!;
    const cx = 100, cy = 100, r = 92;

    for (let i = 0; i < 12; i++) {
      const angle = (i * 30 * Math.PI) / 180;
      const major = i % 3 === 0;
      const inner = major ? r - 14 : r - 7;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(cx + r * Math.sin(angle)));
      line.setAttribute('y1', String(cy - r * Math.cos(angle)));
      line.setAttribute('x2', String(cx + inner * Math.sin(angle)));
      line.setAttribute('y2', String(cy - inner * Math.cos(angle)));
      line.setAttribute('stroke', major ? '#666' : '#3a3a3a');
      line.setAttribute('stroke-width', major ? '2' : '1');
      ticksEl.appendChild(line);
    }
  }

  setSearching(searching: boolean) {
    this.wrapperEl.classList.toggle('searching', searching);
    if (searching) {
      // Reset accumulated angles so first real update animates from 0
      this.prevRoseAngle = 0;
      this.prevNeedleAngle = 0;
      this.roseEl.style.transform = '';
      this.needleEl.style.transform = '';
    }
  }

  update(bearingDeg: number, deviceHeading: number) {
    // Rose counter-rotates so N stays pointing geographic North
    const roseTarget = shortestArc(this.prevRoseAngle, -deviceHeading);
    this.prevRoseAngle = roseTarget;
    this.roseEl.style.transform = `rotate(${roseTarget}deg)`;

    // Needle points at bearing relative to device heading
    const needleTarget = shortestArc(
      this.prevNeedleAngle,
      bearingDeg - deviceHeading
    );
    this.prevNeedleAngle = needleTarget;
    this.needleEl.style.transform = `rotate(${needleTarget}deg)`;
  }
}
