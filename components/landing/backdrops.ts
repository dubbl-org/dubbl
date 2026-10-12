/*
 * Painted backdrops for product shots. Pre-encoded AVIF plus a 24px WebP
 * placeholder inlined so the panel is never blank while the image streams in.
 * The tonalist set (desaturated: modulate({ saturation: 0.55 }), avif q42) is
 * 1200w / 640w; the gouache landscapes (modulate({ saturation: 0.82,
 * brightness: 1.02 }), avif q46) are 1600w / 800w.
 */
export type Backdrop = {
  name: string;
  blur: string;
  /** [small, large] encoded widths. */
  widths?: [number, number];
};

export const backdrops = {
  snowfield: {
    name: "snowfield",
    blur: "data:image/webp;base64,UklGRlQAAABXRUJQVlA4IEgAAABQAwCdASoYABIAPu1qrFEppaSiqAqpMB2JaQDNSBESKHnIgAD+rm9aKzr2vI9NGiK+M7wXEl1TADpwqhcBDqmfKvY2YBGKAAA=",
  },
  lakeRange: {
    name: "lake-range",
    blur: "data:image/webp;base64,UklGRlQAAABXRUJQVlA4IEgAAACwAwCdASoYABIAPuVepE2pJSOiMAwBIByJZwAAW82iN5xoGqCiAAD+5xMvtH9tdNrvXCjGRdj4Jpnphk8Mv/3bWQkQnKua2AA=",
  },
  shoreline: {
    name: "shoreline",
    blur: "data:image/webp;base64,UklGRlYAAABXRUJQVlA4IEoAAAAwBACdASoYABIAPt1WpU2opKOiN/qoARAbiWkAy2gh37978EKmtUwZUgAA/up5cq32cbjftVhKgcSCam2R2pHJ0zIkkG6+EaKYAA==",
  },
  cove: {
    name: "cove",
    blur: "data:image/webp;base64,UklGRlgAAABXRUJQVlA4IEwAAAAQBACdASoYABIAPtlapE2oJSOiN/qoAQAbCWcAwNwh34vrmjuzu70EAAD+UNHELavJhFUU+w1kLOIBplFtqHMIA1krDVekODnoHcAA",
  },
  ridgeline: {
    name: "ridgeline",
    widths: [800, 1600],
    blur: "data:image/webp;base64,UklGRqoAAABXRUJQVlA4IJ4AAAAwBACdASoYABAAPu1iqU2ppaOiMAgBMB2JbACdMoMYAEl5JPK/q4fH8oAA/urH4+WmldvoMlOUkmLNtVNo9kp2wcDhhGUZkRFi9Sqf14928TxqQLN8sr5xLPcX0IRiort25ayTI61CAgL/C5OiiQ8cHqWDh1yrK6ZwPtMkkYz22bsfWvQXmVwx9Rj/mJACYW+6Wkk4VWPecM9XpY6gAA==",
  },
  amberValley: {
    name: "amber-valley",
    widths: [800, 1600],
    blur: "data:image/webp;base64,UklGRoQAAABXRUJQVlA4IHgAAACQBACdASoYABAAPu1iqU2ppaOiMAgBMB2JaACdMoLT+z/4DxyzzevQ466mtAAA/upvr4kRtbRoqCEhKUBdEwO9rq8iVvlle+xZGQ5oVuVLrqBJAGmksYtAQoe7cwDbSTrGkHDRUJibWoqz0mQlX6to/luvBiMZIAA=",
  },
  savanna: {
    name: "savanna",
    widths: [800, 1600],
    blur: "data:image/webp;base64,UklGRoIAAABXRUJQVlA4IHYAAAAwBACdASoYABAAPu1iqU2ppaQiMAgBMB2JaACdMoADTevO5Ssx2Zi7xCgA/ucRruggG1o1uzpxJryX/JHEKhTOBDgdVAhlKFt3PVk0DIuLYQZbZdBbw9HuMw8dOKbcy73lD9RwKovJfoM0VWPfMPp19CGqUAAA",
  },
  birchGold: {
    name: "birch-gold",
    widths: [800, 1600],
    blur: "data:image/webp;base64,UklGRm4AAABXRUJQVlA4IGIAAAAQBACdASoYABAAPu1iqU2ppaOiMAgBMB2JZgCdMoMYAEmbH9PyIypm1AD+77bdcLTNV2XD2YPClsfh3XwLr8E1cyzXpauh/tD2QXcOAkciQ4PRTaz4gWaioWT44WncrAAAAA==",
  },
  terraces: {
    name: "terraces",
    widths: [800, 1600],
    blur: "data:image/webp;base64,UklGRo4AAABXRUJQVlA4IIIAAAAwBACdASoYABAAPu1iqU2ppaOiMAgBMB2JZgCw7B6JsvbUdJR9FPrengAA/ud77iQf4kB7LB4gD2E09iyBlmaunsu96hLTCKYlQ9UzDOSp8uwAxgI8k6to9G0SHp5Iu1P5a2jRA8mhTExyLseWdc2v1DqCyg/qEBvKsmwy697CjgAA",
  },
  sunflowers: {
    name: "sunflowers",
    widths: [800, 1600],
    blur: "data:image/webp;base64,UklGRqAAAABXRUJQVlA4IJQAAACQBACdASoYABAAPu1iqU2ppaOiMAgBMB2JagCdMoRwIr+AnK0VuaMFO3MJsSQA/u2tDEMwDNFAT+4ze39tUqXfT55li1AOsgXBqbAsXDS/lqKHn3cPbIwR1X7P0+hDGVCejRdfxRkGEMcN5HMKCtHruJ9Ex2B3q42rhQLXByKrX5lxRLg2C9Brw/QMgmyEcsci4AAA",
  },
  shoreGrass: {
    name: "shore-grass",
    widths: [800, 1600],
    blur: "data:image/webp;base64,UklGRlgAAABXRUJQVlA4IEwAAADQAwCdASoYABAAPu1iqk4ppaQiMAgBMB2JQBYdhDvbHJTiXCKt9AAA/uddco2IKKRo85P0vZTc7LCAWtXfNAelWmY7yJtPhZXE5EAA",
  },
  mistValley: {
    name: "mist-valley",
    widths: [800, 1600],
    blur: "data:image/webp;base64,UklGRpQAAABXRUJQVlA4IIgAAABQBACdASoYABAAPu1kq04ppaQiMAgBMB2JZgCdMoBOACaLK+hAqo1dmEQAAP7tN+Z2pI6UBckUtdpfPGol51JCYsbHaBeWp/aC33oJfkd1yW5gG5l06faTDYjfuY5ssLldF6uP6HtMQoQT0FRJnWLCRBa4QYzif/PeZcQGv4LTuuBWK+uBqAAA",
  },
  moonGrass: {
    name: "moon-grass",
    widths: [800, 1600],
    blur: "data:image/webp;base64,UklGRmQAAABXRUJQVlA4IFgAAABQAwCdASoYABAAPu1iqU2ppaQiMAgBMB2JYwCw7C0HrGBlXAD+7jguTx/w+j8nF2klwaiYUH0ZtQZand0Ri5mBW//LlnxPuABq+XDG5BGSVCVBqB0NcvgA",
  },
  redRanges: {
    name: "red-ranges",
    widths: [800, 1600],
    blur: "data:image/webp;base64,UklGRnIAAABXRUJQVlA4IGYAAADwAwCdASoYABAAPu1iqU2ppaOiMAgBMB2JZgCdMoADTEMy31TeIPgoAP5b77upAD8i1wGmI1bMOgESlNaslSHjShz1L1AYwRyT89QfNPPjVUAG1b4QYn1XxodDRn1EUef9Fs5AAAA=",
  },
} satisfies Record<string, Backdrop>;
