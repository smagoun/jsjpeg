/**
 * Array-based implementation of a Huffman decoder based on the
 * solution outlined in the JPEG spec.
 */
class HuffArray {

    constructor() {
        this.huffval = [];
        this.huffsize = [];
        this.huffcode = [];
    }

    /**
     * Initialize the decoder with the 'BITS' array containing the number of huffman codes
     * of each length.
     * 
     * @param {Array} bits List of the number of Huffman codes of each length (0-NUM_HUFFMAN_LENGTHS)
     */
    initDecoder(bits) {
        this.bits = bits;

        // Generate code sizes (JPEG Spec Fig. C.1)
        let k = 0;
        let lastk = 0;
        for (let i = 1; i <= NUM_HUFFMAN_LENGTHS; i++) {
            for (let j = 1; j <= this.bits[i]; j++) {
                this.huffsize[k++] = i;
            }
        }
        this.huffsize[k] = 0;
        lastk = k;
        console.log("HUFFSIZE: " + this.huffsize);

        // Generate codes (JPEG Spec Fig. C.2)
        k = 0;
        let code = 0;
        let si = this.huffsize[0];

        while (this.huffsize[k] != 0) {
            while (this.huffsize[k] === si) {
                this.huffcode[k++] = code++;
            }
            code = code << 1;
            si++;
        }
        // Note: this incorrectly drops leading zeros, for example the huffcode '001' is printed as '1'
        console.log("HUFFCODE: " + this.huffcode.map(x => x.toString(2)));
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
        this.huffval.push(value);
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
        let mincode = [];
        let maxcode = [];
        let valptr = [];

        let i = 0;
        let j = 0;
        while (true) {
            i++;
            if (i > NUM_HUFFMAN_LENGTHS) {
                break;
            }
            if (this.bits[i] === 0) {
                maxcode[i] = -1;
            } else {
                valptr[i] = j;
                mincode[i] = this.huffcode[j];
                j += this.bits[i] - 1;
                maxcode[i] = this.huffcode[j];
                j++;
            }
        }

        i = 1;
        // let bitString = "";
        let code = reader.nextBit(img);
        // bitString += code;
        while (code > maxcode[i]) {
            i++;
            let tmp = reader.nextBit(img);
            // bitString += tmp;
            code = (code << 1) + tmp;
        }
        j = valptr[i];
        j += code - mincode[i];
        let value = this.huffval[j];
        // console.log("Found value " + value + " for code " + code + " bitString: " + bitString);
        return value;
    }
}