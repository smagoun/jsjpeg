class DataViewReader {
    
    /**
     * Creates a new DataViewReader from the DataView
     * 
     * @param {DataView} view 
     */
    constructor(view) {
        this.view = view;
        this.index = -1;     // Last byte we looked at
        this.bitIndex = 7;  // Last bit we looked at. Starts with the high bit
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
        return this.index < this.view.byteLength;
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

    // /**
    //  * Returns the next bit, working from high to low
    //  */
    // nextBit() {
    //     if (this.bitIndex === 0) {
    //         this.bitIndex = 7;
    //         this.index++;
    //     } else {
    //         this.bitIndex--;
    //     }
    //     let bit = this.view.getUint8(this.index);
    //     return (bit >> this.bitIndex) & 0x1;
    // }

    // /**
    //  * Return the next numBits bits, most-significant bit first
    //  * 
    //  * Implements F.2.2.4 from the spec
    //  * 
    //  * @param {*} numBits 
    //  */
    // nextBits(numBits) { // Spec calls numBits 'ssss'
    //     let ret = 0;    // Spec calls ret 'v'
    //     for (let i = 0; i < numBits; i++) {
    //         ret = (ret << 1) + this.nextBit();
    //     }
    //     return ret;
    // }
}