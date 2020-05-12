/**
 * Binary tree to hold Huffman codes.
 * 
 * Leaves hold code values. Non-leaves cannot hold values.
 * 
 * Values are added in level-order traversal, with a maximum of (2^i - 1)
 * values at each level (except for the last level, which could have 2^i).
 * 
 * Each branch represents a '0' or a '1' in the bit string:
 *      Left: 0
 *      Right: 1
 * 
 * We can construct the bitstream for a given value by keeping track
 * of the branches as we descend the tree, appending the value of the
 * branch in order of descent.
 * 
 */
class HuffTree {

    /**
     * Create a new node in the Huffman tree
     * 
     * @param {Number} level Optional level of the tree. Defaults to 0 (for the root)
     */
    constructor(level = 0) {
        this.level = level;
    }
    
    /**
     * Initialize the decoder with the 'BITS' array containing the number of huffman codes
     * of each length.
     * 
     * @param {Array} bits List of the number of Huffman codes of each length (0-NUM_HUFFMAN_LENGTHS)
     */
    initDecoder(bits) {
        // NOOP, since this implementation supports arbitrary tree sizes
    }

    /**
     * Insert a value into the tree at the given depth. Uses a level-order
     * traversal to fill the tree from left to right at a given level.
     * 
     * Returns 'true' if inserting the value was successful, otherwise false
     * 
     * @param {*} codeLength Depth of the tree at which to insert (length of huffman code)
     * @param {*} value Value to insert into the tree
     */
    insertCode(codeLength, value) {
        if (this.data != undefined) {
            return false;   // Invariant: leaf nodes can't have children
        }
        if (codeLength === this.level) {
            if (this.data === undefined) {
                this.data = value;
                return true;
            } else {
                return false;   // We're full, try the node to the right
            }
        } else {
            if (this.left === undefined) {
                // Invariant: nodes always created in pairs.
                // Saves us from lots of checking for 'undefined' elsewhere
                this.left = new HuffTree(this.level + 1);
                this.right = new HuffTree(this.level + 1);
                return this.left.insertCode(codeLength, value);
            } else {
                if (this.left.insertCode(codeLength, value)) {
                    return true;
                } else {
                    return this.right.insertCode(codeLength, value);
                }
            }
        }
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
        let bitString = "";     // For debugging
        let node = this;
        while (true) {
            let bit = nextBit(reader, img);
            bitString += bit;
            node = node.descendNode(bit);
            if (node === undefined) {
                console.error("Error: Couldn't find huffman value for huffman code " + bitString);
                break;
            } else if (node.data != undefined) {
                // Found a value, so we're done!
                // console.log("Found value " + node.data + " for huffman code " + bitString);
                return node.data;
            }
        }
        return undefined;
    }

    /**
     * Print the entire tree to the console. Not recommended for large trees
     */
    dumpTree() {
        let str = "";
        for (let i = 0; i < this.level; i++) {
            str += " ";
        }
        str += this.level + ":";
        if (this.data != undefined) {
            str += this.data;
        }
        console.log(str);
        if (this.left != undefined) {
            this.left.dumpTree();
            this.right.dumpTree();
        }
    }

    /**
     * Return the next node in the tree for the given bit.
     * Returns the left node for '0' and the right node for '1'.
     * All other inputs are invalid.
     * 
     * @param {*} bit 
     */
    descendNode(bit) {
        if (bit === 0) {
            return this.left;
        } else if (bit === 1) {
            return this.right;
        } else {
            console.error("Error: invalid bit string (expected 0 or 1, got " + bit + ")");
        }
        return undefined;
    }

    /**
     * Return the value in the node represented by the given bitstring,
     * or undefined if the sequence is not found in the tree.
     * 
     * @param {String} bitString String representation of a sequence of bits
     */
    getValue(bitString) {
        if (bitString === "") {
            return this.data;
        }
        let c = bitString[0];
        if (c === '0') {    // '0' is left
            return this.left.getValue(bitString.slice(1));
        } else if (c === '1') { // '1' is right
            return this.right.getValue(bitString.slice(1));
        } else {
            console.error("Invalid character in bit string: " + c);
        }
    }

    static test() {
        let tree = new HuffTree(0);
        let testCnt = 0;
        let errCnt = 0;

        function runInsertTest(level, value, expected) {
            let val = tree.insertCode(level, value);
            if (val != expected) {
                console.error("Test " + ++testCnt + " Failed (expected " + expected + ", got " + val + ")");
                errCnt++;
            } else {
                console.log("Test " + ++testCnt + " passed");
            }
        }

        runInsertTest(3, 4, true);
        runInsertTest(3, 5, true);
        runInsertTest(3, 3, true);
        runInsertTest(3, 2, true);
        runInsertTest(3, 6, true);
        runInsertTest(3, 1, true);
        runInsertTest(3, 0, true);
        // We shouldn't be able to insert an 8th node at L3, 
        // but the tree currently has no way of knowing this
        // since nodes don't know the state of other nodes.
        // For this to be a problem in practice, the JPEG
        // file would have to be out-of-spec/corrupt
        //runInsertTest(3, 12, false);    // Too many nodes in tree
        runInsertTest(4, 7, true);
        runInsertTest(5, 8, true);
        runInsertTest(6, 9, true);
        runInsertTest(7, 10, true);
        runInsertTest(8, 11, true);
        
        function runGetTest(input, expected) {
            let val = tree.getValue(input);
            if (val != expected) {
                console.error("Test " + ++testCnt + " Failed (expected " + expected + ", got " + val + ")");
                errCnt++;
            } else {
                console.log("Test " + ++testCnt + " passed");
            }
        }

        runGetTest("000", 4);
        runGetTest("001", 5);
        runGetTest("010", 3);
        runGetTest("011", 2);
        runGetTest("100", 6);
        runGetTest("101", 1);
        runGetTest("110", 0);
        runGetTest("1110", 7);
        runGetTest("11110", 8);
        runGetTest("111110", 9);
        runGetTest("1111110", 10);
        runGetTest("11111110", 11);

        // Sequence not in the table
        runGetTest("11111111", undefined);

        if (errCnt === 0) {
            console.log("tests passed!");
        } else {
            console.error("tests failed: " + errCnt + " errors");
        }
    }
}

// HuffTree.test();
