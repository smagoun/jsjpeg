/**
 * Maximum # of bits in Huffman table.
 */
const TABLE_LENGTH = 16; // TODO: Should be 16

/**
 * Probably won't fit in cache, but simplifies code by not having a 2-level table
 */
const TABLE_ENTRIES = 1 << TABLE_LENGTH;

/**
 * Lookup table implementation of a Huffman decoder. Allows decoding multiple bits at once,
 * for a performance improvement.
 */
class HuffTable {

    /**
     * Initialize the decoder with the 'BITS' array containing the number of huffman codes
     * of each length.
     * 
     * @param {Array} bits List of the number of Huffman codes of each length (0-NUM_HUFFMAN_LENGTHS)
     */
    initDecoder(bits) {
        this.bits = bits;
        // Table of values, # of bits to store value (interleaved)
        this.table = new Array(TABLE_ENTRIES * 2);
        // # of elements of length i we've placed so far. Used during insertCode()
        this.counts = new Array(bits.length).fill(0);
        this.index = 0; // Next free index in code table; used when inserting codes
    }

    /**
     * Insert a value into the tree at the given depth.
     * 
     * Returns 'true' if inserting the value was successful, otherwise false
     * 
     * @param {*} codeLength Length of huffman code
     * @param {*} value Value to insert
     */
    insertCode(codeLength, value) {
        if (codeLength > TABLE_LENGTH) {
            console.error(`Can't insert value of length ${codeLength}; max size ${TABLE_LENGTH}`);
            return false;
        }
        let tmp = this.counts[codeLength]; // # of codes already in the table
        if (tmp >= this.bits[codeLength]) {
            console.error(`Too many codes of length ${codeLength} when inserting ${value}`);
            return false;
        }
        this.counts[codeLength]++;
        let numValues = 1 << (TABLE_LENGTH - codeLength);   // # of times to repeat the code
        for (let i = 0; i < numValues; i++) {
            this.table[this.index++] = value;
            this.table[this.index++] = codeLength;
        }
        return true;
    }

    /**
     * Read the next huffman code from the data source and return the
     * value represented by the code.
     * 
     * F.2.2.3
     * 
     * @param {DataViewReader} reader Data source
     * @param {*} img Struct containing information about the image
     */
    decodeHuffman(reader, img) {
        let index = reader.peek(img, TABLE_LENGTH) * 2;
        let val = this.table[index++];
        let shift = this.table[index];  // # of bits in this huffman code
        reader.consumeBits(shift);
        return val;
    }
}
