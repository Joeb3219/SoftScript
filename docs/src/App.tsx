import { ApplesoftAssembler, ApplesoftDisassembler, WaveFileGenerator, WaveFileReader } from "@joeb3219/softscript";
import { Button, Divider, Grid } from "@material-ui/core";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import CodeMirror from "@uiw/react-codemirror";
import React from "react";
import "./App.css";
import BaseHexEditor from 'react-hex-editor';
import _ from 'lodash';
import oneDarkPro from 'react-hex-editor/themes/oneDarkPro';

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
        <Grid item container direction={'row'} style={{ padding: 16, width: '100%', backgroundColor: '#5D7681' }}>
        <Grid item style={{ marginRight: 8 }}>
          <Button variant={"contained"} color={"primary"}>
              text
          </Button>
        </Grid>
        <Grid item style={{ marginRight: 8 }}>
          <Divider orientation={"vertical"}/>
        </Grid>
            <Grid item style={{ marginRight: 8 }}>
              <Button variant={"contained"} color={"primary"}>
                  text
              </Button>
            </Grid>
            <Grid item style={{ marginRight: 8 }}>
              <Divider orientation={"vertical"} />
            </Grid>
            <Grid item style={{ marginRight: 8 }}>
              <Button variant={"contained"} color={"primary"}>
                  text
              </Button>
            </Grid>
        </Grid>
    );
};

interface BasicEditorProps {
  lines: string[];
  setLines: (lines: string[]) => void;
  style?: React.CSSProperties;
}

const BasicEditor: React.FC<BasicEditorProps> = ({ lines, setLines, style }) => {
  return <CodeMirror
    height={'100%'}
    style={{ width: '100%', height: '100%', ...style }}
    theme={vscodeDark}
    lang={"BASIC"}
    extensions={[]}
    onChange={(value) => setLines(value.split("\r\n"))}
    value={lines.join("\r\n")}
  />
}

const LeftPanel: React.FC<BasicEditorProps> = ({ lines, setLines }) => {
  return <Grid item container direction={'column'} xs style={{ padding: '16px', height: '100%', width: '100%' }}>
    <BasicEditor lines={lines} setLines={setLines}/>
  </Grid>
}

function useBasicConversion(lines: string[]) {
  const [bytes, setBytes] = React.useState<number[][]>([]);

  React.useEffect(() => {
    const assembler = new ApplesoftAssembler(
      lines.map((l, idx) => `${idx + 1} ${l}`)
    );
    const res = assembler.assembleMappedToInstruction();
    setBytes(res);
  }, [lines]);

  return bytes;
}

function useSaveWaveFile(lines: string[]) {
  return React.useCallback((shouldAutoRun: boolean) => {
    const generator = new WaveFileGenerator(lines);
    const buffer = generator.generate(shouldAutoRun);
    const url = window.URL.createObjectURL(
      new Blob([buffer]),
    );
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `AppleII_Cassette_${Date.now()}.wav`,
    );
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
  }, [lines])
}

const RightPanel: React.FC<BasicEditorProps> = ({ lines, setLines }) => {
  const bytes = useBasicConversion(lines);
  const [byteData, setByteData] = React.useState<number[]>([]);
  const [error, setError] = React.useState<boolean>(false);
  const downloadWave = useSaveWaveFile(lines);

  React.useEffect(() => {
    setByteData(_.flatten(bytes));
  }, [bytes, setByteData])

  return <Grid xs item style={{ height: '100%', width: '100%', backgroundColor: '#37464C' }}>
    <Grid item container direction={'column'} style={{ height: '100%', width: '100%', padding: '16px' }}>
      <Grid item>
        <>
          <Grid container direction={'row'} spacing={1}>
          <Grid item>
              <Button variant={"contained"} color={"primary"} onClick={() => downloadWave(true)}>WAVE (Auto Run)</Button>
            </Grid>
            <Grid item >
              <Button variant={"contained"} color={"primary"} onClick={() => downloadWave(false)}>WAVE (No Auto Run)</Button>
            </Grid>
            <Grid item>
            <Button
  variant="contained"
  component="label"
>
  Upload File
  <input
    type="file"
    hidden
    onChange={event => {
      console.log(event);
      const fileReader = new FileReader();
      const blob = event.target.files?.[0];

      if (!blob) {
        // TOOD: snackbar.
        console.error('No file read');
        return;
      }

      fileReader.readAsArrayBuffer(blob);
      fileReader.onload = (e) => {
        const result = e.target?.result;
        if (!result || typeof result === 'string') {
          return;
        }

        const reader = new WaveFileReader(Buffer.from(result));
        const bytes = reader.read();

        if ('basic' in bytes) {
          const deassembler = new ApplesoftDisassembler(bytes.basic);
          const lines = deassembler.disassemble();
          setLines(lines.map(l => l.dataString));
        }
      }
    }}
  />
</Button>
            </Grid>
          </Grid>
          Some Content
          <BaseHexEditor showAscii theme={{ hexEditor: oneDarkPro }} columns={24} data={byteData} rows={12} height={400} width={800} onSetValue={(pos: number,val: number) => {
            setError(false);
            const flatBytes = _.flatten(bytes);
            flatBytes[pos] = val;
            setByteData(flatBytes);

            try {
              const disassembler = new ApplesoftDisassembler(flatBytes);
              const result = disassembler.disassemble();
              setLines(result.map(r => r.dataString))
            }catch(err) {
              console.error(err);
              setError(true);
            }


            console.log(pos,val);
          }}  />
        </>
      </Grid>
    </Grid>
  </Grid>
}

function App() {
    const [bytes, setBytes] = React.useState<number[]>([]);
    const [lines, setLines] = React.useState<string[]>([]);
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
        container direction={'column'}
            style={{
                backgroundColor: "#485B63",
                height: "100%",
                width: "100vw",
                margin: 0,
                padding: 0,
                minHeight: '100vh'
            }}
        >
            <Header />
            <Grid item container direction={'row'} style={{ height: '100vh' }}>
              <LeftPanel lines={lines} setLines={setLines}/>
              <RightPanel lines={lines} setLines={setLines}/>
            
            {/* {bytes?.join(", ")}
            <button
                onClick={() => {
                    const gen = new WaveFileGenerator(
                        lines.map((l, idx) => `${idx + 1} ${l}`)
                    );
                    setBuff(gen.generate(true));
                }}
            >
                Generate download
            </button>

            {buffLink && <a href={buffLink}>DOWNLOAD</a>} */}
          </Grid>

      </Grid>
    );
}

export default App;
