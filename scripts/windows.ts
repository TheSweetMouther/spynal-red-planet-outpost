// The curated "Real Storm Replay" windows. Each is a little longer than the
// 10-sol mission so the seed can slide the start day.
export interface ReplayWindow {
  id: string;
  title: string;
  start: string;
  end: string;
  marsObserved: boolean;
  blurb: string;
  /** DONKI web-page ID range that covers this window (used by the Wayback importer). */
  viewIds: [number, number];
}

export const WINDOWS: ReplayWindow[] = [
  {
    id: 'sep2017',
    title: 'September 2017 solar storms',
    start: '2017-09-03',
    end: '2017-09-14',
    marsObserved: true,
    blurb: 'Big flares in September 2017. NASA spacecraft at Mars measured this storm too.',
    viewIds: [12900, 13200],
  },
  {
    id: 'may2024',
    title: 'May 2024 solar storms',
    start: '2024-05-09',
    end: '2024-05-20',
    marsObserved: true,
    blurb: 'A very active Sun in May 2024. Curiosity and MAVEN watched solar storms reach Mars that month.',
    viewIds: [30300, 31100],
  },
];

export const DONKI_NEW = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get';
export const DONKI_OLD = 'https://api.nasa.gov/DONKI';
