import {
    ApplesoftAssembler,
    ApplesoftDisassembler,
    WaveFileGenerator,
    WaveFileReader,
} from "@joeb3219/softscript";
import { Button, Grid, Typography } from "@material-ui/core";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import CodeMirror from "@uiw/react-codemirror";
import _ from "lodash";
import React from "react";
import BaseHexEditor from "react-hex-editor";
import oneDarkPro from "react-hex-editor/themes/oneDarkPro";
import "./App.css";
import DownloadIcon from '@material-ui/icons/GetApp';
import UploadIcon from '@material-ui/icons/Publish';
/*
LET x = 5
LET y = x + 6
PRINT x / y
REM "this is just" a good "quote"
y = y - 1
IF y > 3 THEN GOTO 5
PRINT y
PRINT "That is all, thank you"
END
*/

const Header: React.FC = () => {
    return (
        <Grid
            item
            container
            direction={"row"}
            style={{
                padding: 16,
                width: "100%",
                backgroundColor: "#5D7681",
                height: 56,
            }}
        >
            <Grid item>
                <Typography variant={"h6"} color={"primary"}>
                    SoftScript: Apple ][ Tools (WIP)
                </Typography>
            </Grid>
            <Grid item xs />
            <Grid item style={{ marginTop: 4 }}>
                <Typography variant={"body1"} color={"secondary"}>
                    By Joseph A. Boyle
                </Typography>
            </Grid>
        </Grid>
    );
};

interface BasicEditorProps {
    lines: string[];
    setLines: (lines: string[]) => void;
    activeLineNumber: number;
    setActiveLineNumber: (lineNumber: number) => void;
    style?: React.CSSProperties;
}

const BasicEditor: React.FC<BasicEditorProps> = ({
    lines,
    setLines,
    style,
    setActiveLineNumber,
}) => {
    return (
        <CodeMirror
            height={"100%"}
            style={{ width: "100%", height: "100%", ...style }}
            theme={vscodeDark}
            lang={"BASIC"}
            extensions={[]}
            onChange={(value) => setLines(value.split("\n"))}
            value={lines.join("\n")}
            onStatistics={(stats) => {
                setActiveLineNumber(stats.line.number - 1);
            }}
        />
    );
};

const LeftPanel: React.FC<BasicEditorProps> = (props) => {
    return (
        <Grid
            item
            container
            direction={"column"}
            xs
            style={{ padding: "16px", height: "100%", width: "100%" }}
        >
            <Grid item>
            <Typography variant={'h6'} color={'primary'}>
                BASIC
              </Typography>
              <Typography variant={'body2'} color={'primary'}>
                Enter a BASIC program here. You do not need to manually add line numbers -- they will be inferred by the line of the file.
              </Typography>
              </Grid>
            <Grid item xs>
              <BasicEditor {...props} />
            </Grid>
        </Grid>
    );
};

function useBasicConversion(lines: string[]) {
    const [bytes, setBytes] = React.useState<number[][]>([]);

    React.useEffect(() => {
        const assembler = new ApplesoftAssembler(
            lines.filter((l) => !!l).map((l, idx) => `${idx + 1} ${l}`)
        );
        const res = assembler.assembleMappedToInstruction();
        setBytes(res);
    }, [lines]);

    return bytes;
}

function useSaveWaveFile(lines: string[]) {
    return React.useCallback(
        (shouldAutoRun: boolean) => {
            const generator = new WaveFileGenerator(
                lines.map((l, idx) => `${idx + 1} ${l}`)
            );
            const buffer = generator.generate(shouldAutoRun);
            const url = window.URL.createObjectURL(new Blob([buffer]));
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `AppleII_Cassette_${Date.now()}.wav`);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
        },
        [lines]
    );
}

const RightPanel: React.FC<BasicEditorProps> = ({
    lines,
    setLines,
    activeLineNumber,
    setActiveLineNumber,
}) => {
    const bytes = useBasicConversion(lines);
    const [byteData, setByteData] = React.useState<number[]>([]);
    const [error, setError] = React.useState<boolean>(false);
    const downloadWave = useSaveWaveFile(lines);
    const ref = React.createRef<typeof BaseHexEditor>();

    React.useEffect(() => {
        setByteData(_.flatten(bytes));
    }, [bytes, setByteData]);

    React.useEffect(() => {
        const byteStart = _.sumBy(
            bytes.slice(0, activeLineNumber),
            (g) => g.length
        );
        const byteEnd = byteStart + (bytes[activeLineNumber]?.length ?? 0);

        ref.current?.setSelectionRange(byteStart, byteEnd);
    }, [ref, activeLineNumber]);

    return (
        <Grid
            xs
            item
            style={{
                height: "100%",
                width: "100%",
                backgroundColor: "#37464C",
            }}
        >
            <Grid
                item
                container
                direction={"column"}
                style={{ height: "100%", width: "100%", padding: "16px" }}
            >
                <Grid item>
                    <>
                        <Grid container direction={"row"} spacing={1}>
                            <Grid item>
                                <Button
                                    variant={"contained"}
                                    color={"primary"}
                                    onClick={() => downloadWave(true)}
                                    startIcon={<DownloadIcon/>}
                                >
                                    Auto Run
                                </Button>
                            </Grid>
                            <Grid item>
                                <Button
                                    variant={"contained"}
                                    color={"primary"}
                                    onClick={() => downloadWave(false)}
                                    startIcon={<DownloadIcon/>}
                                >
                                    No Auto Run
                                </Button>
                            </Grid>
                            <Grid item>
                                <Button
                                    variant={"contained"}
                                    component={"label"}
                                    color={"primary"}
                                    startIcon={<UploadIcon/>}
                                >
                                    WAVE
                                    <input
                                        type="file"
                                        hidden
                                        onChange={(event) => {
                                            const fileReader = new FileReader();
                                            const blob =
                                                event.target.files?.[0];

                                            if (!blob) {
                                                // TOOD: snackbar.
                                                console.error("No file read.");
                                                return;
                                            }

                                            fileReader.readAsArrayBuffer(blob);
                                            fileReader.onload = (e) => {
                                                const result = e.target?.result;
                                                if (
                                                    !result ||
                                                    typeof result === "string"
                                                ) {
                                                    return;
                                                }

                                                const reader =
                                                    new WaveFileReader(
                                                        Buffer.from(result)
                                                    );
                                                const bytes = reader.read();

                                                if ("basic" in bytes) {
                                                    const deassembler =
                                                        new ApplesoftDisassembler(
                                                            bytes.basic
                                                        );
                                                    const lines =
                                                        deassembler.disassemble();
                                                    setLines(
                                                        lines.map(
                                                            (l) => l.dataString
                                                        )
                                                    );
                                                }
                                            };
                                        }}
                                    />
                                </Button>
                            </Grid>
                        </Grid>
                    </>
                    <Grid item style={{ marginTop: 8 }}>
                      <Typography variant={'h6'} color={'primary'}>
                        Decoded Bytes
                      </Typography>
                      <Typography variant={'body2'} color={'primary'}>
                        The bytes corresponding to the current active line in the BASIC editor to the left will be highlighted in this HEX editor. Updating bytes in this editor will cause updates to the lines to the left.
                      </Typography>
                    </Grid>
                    <Grid item>
                        <BaseHexEditor
                            ref={ref}
                            showAscii
                            theme={{ hexEditor: oneDarkPro }}
                            columns={24}
                            data={byteData}
                            rows={12}
                            height={400}
                            width={800}
                            onSetValue={(pos: number, val: number) => {
                                setError(false);
                                byteData[pos] = val;
                                setByteData(byteData);

                                try {
                                    const disassembler =
                                        new ApplesoftDisassembler(byteData);
                                    const result = disassembler.disassemble();
                                    setLines(result.map((r) => r.dataString));
                                } catch (err) {
                                    console.error(err);
                                    setError(true);
                                }
                            }}
                        />
                      </Grid>
                </Grid>
            </Grid>
        </Grid>
    );
};

function App() {
    const [bytes, setBytes] = React.useState<number[]>([]);
    const [lines, setLines] = React.useState<string[]>([]);
    const [activeLineNumber, setActiveLineNumber] = React.useState<number>(0);
    const [buff, setBuff] = React.useState<Buffer | undefined>(undefined);
    const [buffLink, setBuffLink] = React.useState<string | undefined>(
        undefined
    );

    React.useEffect(() => {
        const assembler = new ApplesoftAssembler(
            lines.map((l, idx) => `${idx + 1} ${l}`)
        );
        const res = assembler.assemble();
        setBytes(res);
    }, [lines, setBytes]);

    React.useEffect(() => {
        if (!buff) {
            setBuffLink(undefined);
            return;
        }

        const url = URL.createObjectURL(new Blob([buff]));
        setBuffLink(url);
    }, [buff, setBuffLink]);

    return (
        <Grid
            container
            direction={"column"}
            style={{
                backgroundColor: "#485B63",
                height: "100%",
                width: "100vw",
                margin: 0,
                padding: 0,
                minHeight: "100vh",
            }}
        >
            <Header />
            <Grid item container direction={"row"} style={{ height: "100vh" }}>
                <LeftPanel
                    lines={lines}
                    setLines={setLines}
                    activeLineNumber={activeLineNumber}
                    setActiveLineNumber={setActiveLineNumber}
                />
                <RightPanel
                    lines={lines}
                    setLines={setLines}
                    activeLineNumber={activeLineNumber}
                    setActiveLineNumber={setActiveLineNumber}
                />
            </Grid>
        </Grid>
    );
}

export default App;
