/**
 * Custom blocks for playing polyphonic extended RTTTL strings on Micro:bit V2
 */
//% weight=100 color="#8332a8" icon="\uf025" block="MIDI RTTTL Player"
namespace midiPlayer {

    export enum MidiInstrument {
        //% block="Sine Wave"
        Sine = WaveShape.Sine,
        //% block="Square Wave"
        Square = WaveShape.Square,
        //% block="Sawtooth Wave"
        Sawtooth = WaveShape.Sawtooth,
        //% block="Triangle Wave"
        Triangle = WaveShape.Triangle
    }

    class Channel {
        instrument: MidiInstrument;
        constructor() {
            this.instrument = MidiInstrument.Sine;
        }
    }

    const channels: Channel[] = [
        new Channel(), new Channel(), new Channel(), new Channel(),
        new Channel(), new Channel(), new Channel(), new Channel()
    ];

    //% blockId=midi_set_instrument 
    //% block="set channel $channel instrument to $instrument"
    //% channel.min=0 channel.max=7
    export function setChannelInstrument(channel: number, instrument: MidiInstrument): void {
        if (channel >= 0 && channel < channels.length) {
            channels[channel].instrument = instrument;
        }
    }

    //% blockId=midi_play_note 
    //% block="play MIDI note $midiNote on channel $channel for $duration ms"
    //% channel.min=0 channel.max=7
    export function playNoteOnChannel(channel: number, midiNote: number, duration: number): void {
        if (channel < 0 || channel >= channels.length) return;

        let freq = 440 * Math.pow(2, (midiNote - 69) / 12);
        let wave = channels[channel].instrument as number;

        // Fixed: Swapped to createSoundEffect which properly outputs a string
        let sound = music.createSoundEffect(
            wave, freq, freq, 255, 0, duration,
            SoundExpressionEffect.None, InterpolationCurve.Linear
        );
        music.playSoundEffect(sound, SoundExpressionPlayMode.UntilDone);
    }

    //% blockId=midi_play_chord 
    //% block="play chord $notes on channel $channel for $duration ms"
    //% channel.min=0 channel.max=7
    export function playChord(channel: number, notes: number[], duration: number): void {
        if (notes.length === 0) return;

        let noteDuration = Math.max(10, duration / notes.length);
        for (let i = 0; i < notes.length; i++) {
            let freq = 440 * Math.pow(2, (notes[i] - 69) / 12);
            let wave = channels[channel].instrument as number;

            let sound = music.createSoundEffect(
                wave, freq, freq, 255, 0, noteDuration,
                SoundExpressionEffect.None, InterpolationCurve.Linear
            );
            music.playSoundEffect(sound, SoundExpressionPlayMode.InBackground);
            basic.pause(noteDuration);
        }
    }

    /**
     * Parses and plays an extended RTTTL string asynchronously on a specific channel.
     * Supports chords formatted as: 4(c5+e5+g5)
     */
    //% blockId=midi_play_rtttl
    //% block="play RTTTL script $rtttl on channel $channel"
    //% channel.min=0 channel.max=7
    export function playRTTTL(rtttl: string, channel: number): void {
        control.inBackground(() => {
            let parts = rtttl.split(":");
            if (parts.length < 3) return;

            let controlSection = parts[1];
            let commands = parts[2].split(",");

            let defaultDuration = 4;
            let defaultOctave = 5;
            let bpm = 120;

            let ctrlParts = controlSection.split(",");
            for (let ctrl of ctrlParts) {
                let kv = ctrl.split("=");
                if (kv.length == 2) {
                    let key = kv[0].trim().toLowerCase();
                    let val = parseInt(kv[1]);
                    if (key == "d") defaultDuration = val;
                    if (key == "o") defaultOctave = val;
                    if (key == "b") bpm = val;
                }
            }

            let quarterNoteMs = 60000 / bpm;
            let wholeNoteMs = quarterNoteMs * 4;

            for (let cmd of commands) {
                cmd = cmd.trim().toLowerCase();
                if (cmd.length == 0) continue;

                let i = 0;
                let durationStr = "";
                while (i < cmd.length && cmd.charAt(i) >= '0' && cmd.charAt(i) <= '9') {
                    durationStr += cmd.charAt(i);
                    i++;
                }
                let durationValue = durationStr.length > 0 ? parseInt(durationStr) : defaultDuration;
                let noteMs = wholeNoteMs / durationValue;

                // Parse chord construct
                if (cmd.charAt(i) == '(') {
                    let closingIndex = cmd.indexOf(')', i);
                    if (closingIndex != -1) {
                        // Fixed: Swapped substring to substr expressions
                        let chordContent = cmd.substr(i + 1, closingIndex - (i + 1));
                        let remainder = cmd.substr(closingIndex + 1);
                        if (remainder.indexOf('.') != -1) {
                            noteMs = noteMs * 1.5;
                        }

                        let midiNotes: number[] = [];
                        let chordNotes = chordContent.split("+");
                        for (let cn of chordNotes) {
                            let mn = parseSingleMidiNote(cn, defaultOctave);
                            if (mn >= 0) midiNotes.push(mn);
                        }

                        if (midiNotes.length > 0) {
                            playChord(channel, midiNotes, noteMs);
                        }
                    }
                } else {
                    // Parse single note or structural rest
                    // Fixed: Swapped substring to substr expressions
                    let remainder = cmd.substr(i);
                    let isDotted = remainder.indexOf('.') != -1;
                    if (isDotted) {
                        noteMs = noteMs * 1.5;
                        remainder = remainder.split(".")[0];
                    }

                    if (remainder.charAt(0) == 'p') {
                        basic.pause(noteMs);
                    } else {
                        let mn = parseSingleMidiNote(remainder, defaultOctave);
                        if (mn >= 0) {
                            playNoteOnChannel(channel, mn, noteMs);
                        }
                    }
                }
            }
        });
    }

    function parseSingleMidiNote(noteStr: string, defaultOctave: number): number {
        if (noteStr.length == 0) return -1;
        let letter = noteStr.charAt(0);
        let isSharp = false;
        let idx = 1;

        if (idx < noteStr.length && noteStr.charAt(idx) == '#') {
            isSharp = true;
            idx++;
        }

        let octave = defaultOctave;
        if (idx < noteStr.length) {
            let octNum = parseInt(noteStr.substr(idx));
            if (!isNaN(octNum)) octave = octNum;
        }

        let noteMap: { [key: string]: number } = {
            'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11, 'h': 11
        };

        // Fixed: PXT does not support the 'in' operator. 
        // We fetch the value directly and check if it is undefined instead.
        let base = noteMap[letter];
        if (base === undefined) return -1;

        if (isSharp) base++;

        return (octave + 1) * 12 + base;
    }
}