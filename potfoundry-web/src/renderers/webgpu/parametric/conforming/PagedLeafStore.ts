/** Number of packed-key slots represented by one sparse occupancy page. */
const PAGE_SHIFT = 8;
const PAGE_SIZE = 1 << PAGE_SHIFT;
const PAGE_MASK = PAGE_SIZE - 1;
const WORD_SHIFT = 5;
const WORDS_PER_PAGE = PAGE_SIZE >>> WORD_SHIFT;

interface LeafPage {
  /** One membership bit per packed-key slot. */
  readonly occupancy: Uint32Array;
  /** Insertion generation for the currently-live value in each slot. */
  readonly generation: Uint32Array;
  active: number;
}

/**
 * Sparse packed-integer set used by the conforming quadtree.
 *
 * Membership lives in paged bitsets rather than one hash entry per leaf. An
 * append-only `(key,generation)` log preserves JavaScript `Set` iteration
 * semantics exactly: adding an existing key keeps its position, while deleting
 * and re-adding it moves it to the end. Stale log entries are rejected by the
 * per-slot generation stored in the sparse page.
 */
export class PagedLeafStore implements Iterable<number> {
  private readonly pages = new Map<number, LeafPage>();
  private readonly orderKeys: number[] = [];
  private readonly orderGenerations: number[] = [];
  private nextGeneration = 1;
  private activeSize = 0;

  get size(): number {
    return this.activeSize;
  }

  add(key: number): this {
    this.assertKey(key);
    const pageIndex = Math.floor(key / PAGE_SIZE);
    const slot = key & PAGE_MASK;
    let page = this.pages.get(pageIndex);
    if (!page) {
      page = {
        occupancy: new Uint32Array(WORDS_PER_PAGE),
        generation: new Uint32Array(PAGE_SIZE),
        active: 0,
      };
      this.pages.set(pageIndex, page);
    }
    const word = slot >>> WORD_SHIFT;
    const bit = 1 << (slot & 31);
    if ((page.occupancy[word] & bit) !== 0) return this;

    if (this.nextGeneration === 0xffff_ffff) this.rebaseGenerations();
    const generation = this.nextGeneration++;
    page.occupancy[word] |= bit;
    page.generation[slot] = generation;
    page.active++;
    this.activeSize++;
    this.orderKeys.push(key);
    this.orderGenerations.push(generation);
    return this;
  }

  delete(key: number): boolean {
    if (!Number.isSafeInteger(key) || key < 0) return false;
    const pageIndex = Math.floor(key / PAGE_SIZE);
    const page = this.pages.get(pageIndex);
    if (!page) return false;
    const slot = key & PAGE_MASK;
    const word = slot >>> WORD_SHIFT;
    const bit = 1 << (slot & 31);
    if ((page.occupancy[word] & bit) === 0) return false;

    page.occupancy[word] &= ~bit;
    page.generation[slot] = 0;
    page.active--;
    this.activeSize--;
    if (page.active === 0) this.pages.delete(pageIndex);
    return true;
  }

  has(key: number): boolean {
    if (!Number.isSafeInteger(key) || key < 0) return false;
    const page = this.pages.get(Math.floor(key / PAGE_SIZE));
    if (!page) return false;
    const slot = key & PAGE_MASK;
    return (page.occupancy[slot >>> WORD_SHIFT] & (1 << (slot & 31))) !== 0;
  }

  clear(): void {
    this.pages.clear();
    this.orderKeys.length = 0;
    this.orderGenerations.length = 0;
    this.nextGeneration = 1;
    this.activeSize = 0;
  }

  values(): IterableIterator<number> {
    return this[Symbol.iterator]();
  }

  *[Symbol.iterator](): IterableIterator<number> {
    for (let i = 0; i < this.orderKeys.length; i++) {
      const key = this.orderKeys[i];
      const page = this.pages.get(Math.floor(key / PAGE_SIZE));
      if (!page) continue;
      const slot = key & PAGE_MASK;
      const occupied =
        (page.occupancy[slot >>> WORD_SHIFT] & (1 << (slot & 31))) !== 0;
      if (occupied && page.generation[slot] === this.orderGenerations[i]) yield key;
    }
  }

  /** Re-number live generations before the uint32 counter can wrap. */
  private rebaseGenerations(): void {
    const live = Array.from(this);
    this.orderKeys.length = 0;
    this.orderGenerations.length = 0;
    this.nextGeneration = 1;
    for (const page of this.pages.values()) page.generation.fill(0);
    for (const key of live) {
      const generation = this.nextGeneration++;
      const page = this.pages.get(Math.floor(key / PAGE_SIZE)) as LeafPage;
      page.generation[key & PAGE_MASK] = generation;
      this.orderKeys.push(key);
      this.orderGenerations.push(generation);
    }
  }

  private assertKey(key: number): void {
    if (!Number.isSafeInteger(key) || key < 0) {
      throw new RangeError(`PagedLeafStore key must be a non-negative safe integer (got ${key})`);
    }
  }
}
