class DataViewReader {
    
    /**
     * Creates a new DataViewReader from the DataView
     * 
     * @param {DataView} view 
     */
    constructor(view) {
        this.view = view;
        this.reset();
    }

    /**
     * Reset the reader to the beginning of the file
     */
    reset() {
        this.index = -1;     // Index of last byte we looked at
        this.byte = 0;  // Current byte; used for reading individual bits
        this.cnt = 0;  // Last bit we looked at. Starts with the high bit
        this.buffer = 0;    // 4 bytes of buffer
        this.buffSize = 0;  // Number of valid bits in the buffer
    }

    /**
     * Return the next byte from the view. Uses getUint8() internally.
     */
    nextByte() {
        return this.view.getUint8(++this.index);
    }

    /**
     * Return the next 2 bytes from the view. Uses getUint16() internally.
     */
    nextWord() {
        let ret = this.view.getUint16(++this.index);
        this.index++;
        return ret;
    }

    /**
     * Return true if there are more bytes to read
     */
    hasMoreBytes() {
        return this.index < this.view.byteLength - 1;
    }

    /**
     * Return the index of the current byte
     */
    currentIndex() {
        return this.index;
    }

    /**
     * Skip ahead by length bytes
     * 
     * @param {*} length 
     */
    skip(length) {
        this.index += length;
    }

    /**
     * Align to the next byte
     */
    align() {
        this.cnt = 0;
        this.buffSize = 0;
    }

    /**
     * Consume numBits bits from the input. Call this after calling peek
     * to look at those bits
     * 
     * @param {*} numBits 
     */
    consumeBits(numBits) {
        if (numBits > this.buffSize) {
            this.peek(numBits);
        }
        // console.log("consuming " + numBits + " bits");
        this.buffSize -= numBits;
    }

    /**
     * Read numBits bits from the bitsream. Based on nextBit(). Maintains
     * an internal cache of bits. Not compatible with use of nextBit();
     * decoding requires using one or the other.
     * 
     * @param {*} img 
     * @param {*} numBits 
     */
    peek(img, numBits) {
        let byte = 0;
        while (this.buffSize < numBits) {
            if (!this.hasMoreBytes()) {
                // No more bytes to read, so fill buffer with ones
                this.buffer = this.buffer << 8 | 0xFF;
                this.buffSize += 8;
            } else {
                // Fill the buffer with some bits from nextbit
                byte = this.nextByte();
                this.buffer = this.buffer << 8 | byte;
                this.buffSize += 8;
                if (byte === 0xFF) {
                    let byte2 = this.nextByte();
                    if (byte2 != 0x0) {
                        if (byte2 === 0xDC) {   // DNL marker
                            parseDNL(this, img);
                            // TODO: End scan
                            console.warn("Found DNL marker in compressed data; not handled!");
                        } else if (byte2 >= 0xD0 && byte2 <= 0xD7) {
                            // Found a restart marker. Put it in the buffer (even though it's not
                            // valid image data) on the assumption that the huffman cache needs some
                            // data (any data would do, since the huffman decoder shouldn't actually 
                            // process those bits for a well-formed image)
                            // Also assume that the decoder is about to look for the reset interval
                            // on its own, so back up the index 2 bytes so that it finds the interval
                            // marker where it expects.
                            this.buffer = this.buffer << 8 | byte;
                            this.buffSize += 8;
                            this.index -= 2;
                        } else if (byte2 === 0xD9) {
                            // Found EOI in the datastream. Ignore it since it's possible we're
                            // looking ahead to the end of the image
                        } else {
                            console.error("Error: Found unexpected marker in compressed data: " + byte2.toString(16));
                        }
                    } else {
                        // Stuffed byte; ignore + let the decoder process the 0xff
                    }
                } else {
                    // Not a potential marker, let the decoder proces it
                }
            }
        }
        // Mask off all but 'numBits' bits
        let ret = this.buffer >> (this.buffSize - numBits) & ((1 << numBits) - 1);
        return ret;
    }

    /**
     * Implement the 'NEXTBIT' function defined in the JPEG spec
     * 
     * F.2.2.5
     * 
     * @param {*} img 
     */
    nextBit(img) {
        if (this.cnt === 0) {
            this.byte = this.nextByte();
            this.cnt = 8;
            if (this.byte === 0xFF) {
                let byte2 = this.nextByte();
                if (byte2 != 0x0) {
                    if (byte2 === 0xDC) {   // DNL marker
                        parseDNL(this, img);
                        // TODO: End scan
                        console.warn("Found DNL marker in compressed data; not handled!");
                    } else if (byte2 >= 0xD0 && byte2 <= 0xD7) {
                        // Handle restart marker (bytes D0-D7, marker RST0-RST7)
                        // We should probably never hit this code path since the RST marker should be found
                        // by the restart marker handler in decodeScan()
                        console.warn("Found RST marker in nextBit()");
                        // Byte-align
                        this.cnt = 1;    // Set to '1' since we'll decrement at the end of the function. Gross.
                        // Reset DC predictors (E.2.4 / F.2.1.3.1)
                        img.scan.dcpred.fill(0);
                        this.byte = this.nextByte();
                    } else {
                        console.error("Error: Found unexpected marker in compressed data: " + byte2.toString(16));
                    }
                } else {
                    // Stuffed byte; ignore + let the decoder process the 0xff
                    ;
                }
            }
        }
        let bit = this.byte >> 7;
        this.cnt--;
        this.byte = this.byte << 1;
        this.byte = this.byte & 0xFF; // Mask off high bits since byte is an int internally
        return bit;
    }
}