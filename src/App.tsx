/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { 
  Play, 
  CheckCircle, 
  AlertCircle, 
  Copy, 
  Info, 
  RefreshCw, 
  Download, 
  Maximize2, 
  Minimize2,
  Terminal,
  Code,
  Sparkles,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI, Type } from "@google/genai";
import { Analytics } from "@vercel/analytics/react";

// --- Types ---

interface Node {
  id: string;
  type: string; // 'start', 'accept', 'trap', 'normal'
  isStart: boolean;
  isAccept: boolean;
  isTrap: boolean;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface Edge {
  source: string | Node;
  target: string | Node;
  label: string;
  index?: number;
}

interface GraphData {
  nodes: Node[];
  links: Edge[];
}

// --- Constants ---

const DEFAULT_INPUT = `q0 - start - 1(q2) 0(qt)
q1 - accept - 1,0(q1)
q2 - normal - 1(q1) 0(qt)
qt - trap - 1,0(qt)`;

const EXAMPLES = {
  binary_div_3: `q0 - start,accept - 0(q0) 1(q1)
q1 - normal - 0(q2) 1(q0)
q2 - normal - 0(q1) 1(q2)`,
  ends_with_01: `q0 - start - 0(q1) 1(q0)
q1 - normal - 0(q1) 1(q2)
q2 - accept - 0(q1) 1(q0)`,
  even_zeros: `q0 - start,accept - 0(q1) 1(q0)
q1 - normal - 0(q0) 1(q1)`
};

const LLM_INSTRUCTIONS = `You are a world-class Automata Theory expert. Your task is to generate DFA/NFA notation in a strict, standardized format.

FORMAT:
[node_id] - [type] - [transitions]

TYPES:
- start: The entry point.
- accept: A final state.
- start,accept: Both entry and final.
- trap: A dead state (all inputs loop back).
- normal: Any other state.

TRANSITION FORMAT:
- input(target_id)
- Multiple inputs to same target: 0,1(q1)
- Separate transitions with spaces: 0(q0) 1(q1)

STRICT RULES:
1. Output ONLY the notation lines.
2. No markdown code blocks (no \`\`\`).
3. No explanations or preamble.
4. Ensure the machine is logically correct.
5. For DFAs, ensure every state has a transition for every alphabet symbol.
6. If the alphabet is not specified, assume {0, 1}.

EXAMPLE OUTPUT:
q0 - start - 0(q0) 1(q1)
q1 - accept - 0,1(q1)`;

// --- Helper Components ---

const Button = ({ onClick, children, className = "", variant = "primary", disabled = false }: any) => {
  const variants: any = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20",
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50",
    outline: "border border-white/10 hover:bg-white/5 text-zinc-400 hover:text-zinc-200",
    ghost: "hover:bg-white/5 text-zinc-500 hover:text-zinc-300",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

// --- Main App ---

export default function App() {
  const [inputText, setInputText] = useState(DEFAULT_INPUT);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedData, setCopiedData] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('manual');
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  useEffect(() => {
    const tourCompleted = localStorage.getItem('dfa_tour_completed');
    if (!tourCompleted) {
      setShowTour(true);
    }
  }, []);

  const completeTour = () => {
    localStorage.setItem('dfa_tour_completed', 'true');
    setShowTour(false);
  };

  const resetZoom = () => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(750)
        .call(zoomRef.current.transform, d3.zoomIdentity);
    }
  };

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Generate a DFA/NFA notation for: "${aiPrompt}"`,
        config: {
          systemInstruction: `You are a world-class Automata Theory expert. Your task is to output DFA/NFA notation in a strict, standardized format.
          
          NOTATION FORMAT:
          [node_id] - [type] - [transitions]
          
          TYPES:
          - start: The entry point.
          - accept: A final state.
          - start,accept: Both entry and final.
          - trap: A dead state (all inputs loop back).
          - normal: Any other state.
          
          TRANSITION FORMAT:
          - input(target_id)
          - Multiple inputs to same target: 0,1(q1)
          - Separate transitions with spaces: 0(q0) 1(q1)
          
          STRICT RULES:
          1. Output ONLY the notation lines.
          2. No markdown code blocks (no \`\`\`).
          3. No explanations or preamble.
          4. Ensure the machine is logically correct for the description.
          5. If it's a DFA, ensure every state has a transition for every alphabet symbol.
          6. If the alphabet is not specified, assume {0, 1}.
          
          EXAMPLE OUTPUT:
          q0 - start - 0(q0) 1(q1)
          q1 - accept - 0,1(q1)`,
          temperature: 0.1,
        },
      });

      const result = response.text?.trim();
      if (result) {
        setInputText(result);
        setAiPrompt("");
        setActiveTab('manual'); // Switch to manual mode to show the result
      } else {
        throw new Error("Empty response from AI");
      }
    } catch (err: any) {
      console.error("AI Generation error:", err);
      setError("AI Generation failed: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Parser ---

  const graphData = useMemo(() => {
    const nodesMap = new Map<string, Node>();
    const linksMap = new Map<string, Edge>();
    
    // Normalize input: split by lines, handle different separators (-, :, ->)
    const lines = inputText.split("\n").filter(l => l.trim());

    if (lines.length === 0) return { nodes: [], links: [] };

    try {
      lines.forEach((line) => {
        // Support multiple separators: -, :, ->
        const parts = line.split(/->|[-:]/).map(p => p.trim());
        if (parts.length < 2) return;

        const id = parts[0];
        const typeStr = parts[1].toLowerCase();
        const transitionsStr = parts.slice(2).join(" "); // Join remaining parts in case of extra separators

        const isStart = typeStr.includes("start");
        const isAccept = typeStr.includes("accept");
        const isTrap = typeStr.includes("trap");

        if (!nodesMap.has(id)) {
          nodesMap.set(id, { id, type: typeStr, isStart, isAccept, isTrap });
        } else {
          const existing = nodesMap.get(id)!;
          existing.isStart = existing.isStart || isStart;
          existing.isAccept = existing.isAccept || isAccept;
          existing.isTrap = existing.isTrap || isTrap;
          existing.type = typeStr;
        }

        // Parse transitions: 
        // 1. 1(q2) or 1,0(q1)
        // 2. 1->q2 or 1:q2
        const transRegex = /([\w,]+)\s*(?:\(|\s*->\s*|\s*:\s*)\s*([\w]+)\s*\)?/g;
        let match;
        while ((match = transRegex.exec(transitionsStr)) !== null) {
          const label = match[1];
          const targetId = match[2];

          if (!nodesMap.has(targetId)) {
            nodesMap.set(targetId, { 
              id: targetId, 
              type: "normal", 
              isStart: false, 
              isAccept: false, 
              isTrap: false 
            });
          }

          // Group links by source-target pair to prevent overlapping
          const linkKey = `${id}->${targetId}`;
          if (linksMap.has(linkKey)) {
            const existingLink = linksMap.get(linkKey)!;
            // Avoid duplicate labels
            const existingLabels = existingLink.label.split(",");
            const newLabels = label.split(",");
            const combined = Array.from(new Set([...existingLabels, ...newLabels])).join(",");
            existingLink.label = combined;
          } else {
            linksMap.set(linkKey, { source: id, target: targetId, label });
          }
        }
      });

      setError(null);
      return { 
        nodes: Array.from(nodesMap.values()), 
        links: Array.from(linksMap.values()) 
      };
    } catch (e: any) {
      setError("Parsing error: " + e.message);
      return { nodes: [], links: [] };
    }
  }, [inputText]);

  // --- Graph Rendering ---

  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = containerRef.current?.clientWidth || 800;
    const height = containerRef.current?.clientHeight || 600;

    const g = svg.append("g");

    // Define gradients and filters
    const defs = svg.append("defs");
    
    // Drop shadow filter
    const shadow = defs.append("filter")
      .attr("id", "shadow")
      .attr("x", "-20%")
      .attr("y", "-20%")
      .attr("width", "140%")
      .attr("height", "140%");
    shadow.append("feGaussianBlur")
      .attr("in", "SourceAlpha")
      .attr("stdDeviation", "3")
      .attr("result", "blur");
    shadow.append("feOffset")
      .attr("in", "blur")
      .attr("dx", "2")
      .attr("dy", "2")
      .attr("result", "offsetBlur");
    const feMerge = shadow.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "offsetBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Pulse animation
    defs.append("style").text(`
      @keyframes pulse {
        0% { stroke-width: 2.5; stroke-opacity: 1; }
        50% { stroke-width: 6; stroke-opacity: 0.5; }
        100% { stroke-width: 2.5; stroke-opacity: 1; }
      }
      .start-pulse {
        animation: pulse 2s infinite ease-in-out;
      }
      @keyframes rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .accept-ring {
        transform-origin: center;
        animation: rotate 20s linear infinite;
      }
    `);

    // Glow filter
    const filter = defs.append("filter")
      .attr("id", "glow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");
    filter.append("feGaussianBlur")
      .attr("stdDeviation", "3")
      .attr("result", "blur");
    filter.append("feComposite")
      .attr("in", "SourceGraphic")
      .attr("in2", "blur")
      .attr("operator", "over");

    // Node Gradients
    const createGradient = (id: string, color1: string, color2: string) => {
      const grad = defs.append("radialGradient")
        .attr("id", id)
        .attr("cx", "30%")
        .attr("cy", "30%")
        .attr("r", "70%");
      grad.append("stop").attr("offset", "0%").attr("stop-color", color1);
      grad.append("stop").attr("offset", "100%").attr("stop-color", color2);
    };

    createGradient("grad-normal", "#3f3f46", "#18181b");
    createGradient("grad-accept", "#10b981", "#064e3b");
    createGradient("grad-trap", "#f43f5e", "#881337");
    createGradient("grad-start", "#3b82f6", "#1e3a8a");

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    zoomRef.current = zoom;
    svg.call(zoom);

    // Markers for arrows
    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 10) // Tip of the arrow
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 7)
      .attr("markerHeight", 7)
      .append("path")
      .attr("d", "M 0,-4 L 10,0 L 0,4")
      .attr("fill", "#71717a");

    const simulation = d3.forceSimulation<Node>(graphData.nodes)
      .force("link", d3.forceLink<Node, Edge>(graphData.links).id(d => d.id).distance(280))
      .force("charge", d3.forceManyBody().strength(-2500).distanceMax(1000))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX<Node>(d => {
        if (d.isStart) return width * 0.15;
        if (d.isAccept) return width * 0.85;
        if (d.isTrap) return width * 0.85;
        return width * 0.5;
      }).strength(0.2))
      .force("y", d3.forceY<Node>(d => {
        if (d.isTrap) return height * 0.85;
        return height * 0.5;
      }).strength(0.2))
      .force("collision", d3.forceCollide().radius(140).iterations(5));

    // Link groups
    const link = g.append("g")
      .selectAll<SVGPathElement, Edge>("path")
      .data(graphData.links)
      .enter().append("path")
      .attr("class", "link")
      .attr("fill", "none")
      .attr("stroke", "#3f3f46")
      .attr("stroke-width", 2.5)
      .attr("marker-end", "url(#arrowhead)");

    const linkLabel = g.append("g")
      .selectAll<SVGTextElement, Edge>("text")
      .data(graphData.links)
      .enter().append("text")
      .attr("font-size", "13px")
      .attr("fill", "#a1a1aa")
      .attr("font-weight", "600")
      .attr("text-anchor", "middle")
      .attr("paint-order", "stroke")
      .attr("stroke", "#09090b")
      .attr("stroke-width", "4px")
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .text((d: Edge) => d.label);

    const node = g.append("g")
      .selectAll<SVGGElement, Node>("g")
      .data(graphData.nodes)
      .enter().append("g")
      .call(d3.drag<SVGGElement, Node>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Node circles with gradients and shadows
    node.append("circle")
      .attr("r", 28)
      .attr("fill", (d: Node) => d.isTrap ? "url(#grad-trap)" : d.isAccept ? "url(#grad-accept)" : d.isStart ? "url(#grad-start)" : "url(#grad-normal)")
      .attr("stroke", (d: Node) => {
        if (d.isStart) return "#3b82f6";
        if (d.isAccept) return "#10b981";
        if (d.isTrap) return "#f43f5e";
        return "#3f3f46";
      })
      .attr("stroke-width", 2)
      .style("filter", (d: Node) => d.isStart ? "url(#glow)" : "url(#shadow)")
      .attr("class", (d: Node) => d.isStart ? "node-circle start-pulse" : "node-circle");

    // Accept state outer ring (more premium look)
    node.filter((d: Node) => d.isAccept)
      .append("circle")
      .attr("r", 34)
      .attr("fill", "none")
      .attr("stroke", "#10b981")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,2")
      .attr("opacity", 0.6)
      .attr("class", "accept-ring");

    // Trap state visual indicator (X mark)
    node.filter((d: Node) => d.isTrap)
      .append("path")
      .attr("d", "M -10,-10 L 10,10 M 10,-10 L -10,10")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 3)
      .attr("opacity", 0.4)
      .attr("pointer-events", "none");

    // Node labels
    node.append("text")
      .attr("dy", ".35em")
      .attr("text-anchor", "middle")
      .attr("fill", "#ffffff")
      .attr("font-size", "14px")
      .attr("font-weight", "700")
      .attr("pointer-events", "none")
      .text((d: Node) => d.id);

    // Start arrow indicator with label
    const startGroup = node.filter((d: Node) => d.isStart)
      .append("g")
      .attr("class", "start-indicator");

    startGroup.append("path")
      .attr("d", "M -80,0 L -31,0")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 3)
      .attr("marker-end", "url(#arrowhead)");

    startGroup.append("text")
      .attr("x", -62)
      .attr("y", -14)
      .attr("text-anchor", "middle")
      .attr("fill", "#60a5fa")
      .attr("font-size", "11px")
      .attr("font-weight", "900")
      .attr("text-transform", "uppercase")
      .attr("letter-spacing", "2px")
      .text("Start");

    simulation.on("tick", () => {
      link.attr("d", (d: Edge) => {
        const source = d.source as Node;
        const target = d.target as Node;
        const radius = 28 + 2.5; 
        
        if (source.id === target.id) {
          const x = source.x!, y = source.y!;
          const r = 35;
          const startAngle = -120 * (Math.PI / 180);
          const endAngle = -60 * (Math.PI / 180);
          
          const x1 = x + radius * Math.cos(startAngle);
          const y1 = y + radius * Math.sin(startAngle);
          const x2 = x + radius * Math.cos(endAngle);
          const y2 = y + radius * Math.sin(endAngle);
          
          return `M ${x1},${y1} A ${r},${r} 0 1,1 ${x2},${y2}`;
        }

        const dx = target.x! - source.x!;
        const dy = target.y! - source.y!;
        const dr = Math.sqrt(dx * dx + dy * dy);
        
        // Check if there is a reverse link
        const hasReverse = graphData.links.some(l => 
          (l.source as Node).id === target.id && (l.target as Node).id === source.id
        );

        // Calculate curvature - always add a slight curve to reduce overlap and collision
        // If there's a reverse link, use a stronger curve
        const curve = hasReverse ? 1.2 : 4.5; 
        const sweep = 1;
        
        // Control point for the quadratic bezier
        const midX = (source.x! + target.x!) / 2;
        const midY = (source.y! + target.y!) / 2;
        const qx = midX + (dy / dr) * (dr / curve);
        const qy = midY - (dx / dr) * (dr / curve);

        // Find intersection with target node boundary for the arrow tip
        // For a curve, we approximate the angle at the target
        const angle = Math.atan2(target.y! - qy, target.x! - qx);
        const tx = target.x! - Math.cos(angle) * radius;
        const ty = target.y! - Math.sin(angle) * radius;

        return `M${source.x},${source.y} Q${qx},${qy} ${tx},${ty}`;
      });

      linkLabel.attr("transform", (d: Edge) => {
        const source = d.source as Node;
        const target = d.target as Node;
        
        if (source.id === target.id) {
          return `translate(${source.x}, ${source.y! - 85})`;
        }

        const dx = target.x! - source.x!;
        const dy = target.y! - source.y!;
        const dr = Math.sqrt(dx * dx + dy * dy);
        
        const hasReverse = graphData.links.some(l => 
          (l.source as Node).id === target.id && (l.target as Node).id === source.id
        );

        const curve = hasReverse ? 1.2 : 4.5;
        const midX = (source.x! + target.x!) / 2;
        const midY = (source.y! + target.y!) / 2;
        
        // Position label at the control point of the curve
        const qx = midX + (dy / dr) * (dr / curve);
        const qy = midY - (dx / dr) * (dr / curve);
        
        // Offset label slightly from the curve
        const labelOffsetX = (dy / dr) * 15;
        const labelOffsetY = (-dx / dr) * 15;
        
        return `translate(${qx + labelOffsetX}, ${qy + labelOffsetY})`;
      });

      node.attr("transform", (d: Node) => `translate(${d.x}, ${d.y})`);
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => simulation.stop();
  }, [graphData]);

  const formatInput = () => {
    const lines = inputText.split("\n").filter(l => l.trim());
    
    // Find max lengths for alignment
    let maxIdLen = 0;
    let maxTypeLen = 0;
    
    lines.forEach(line => {
      const parts = line.split(/->|[-:]/).map(p => p.trim());
      if (parts.length >= 2) {
        maxIdLen = Math.max(maxIdLen, parts[0].length);
        maxTypeLen = Math.max(maxTypeLen, parts[1].length);
      }
    });

    const formatted = lines.map(line => {
      const parts = line.split(/->|[-:]/).map(p => p.trim());
      if (parts.length < 2) return line;
      const id = parts[0];
      const type = parts[1].toLowerCase();
      // Normalize transitions to standard format: input(target)
      const transitionsStr = parts.slice(2).join(" ").trim();
      const transRegex = /([\w,]+)\s*(?:\(|\s*->\s*|\s*:\s*)\s*([\w]+)\s*\)?/g;
      const transitions: string[] = [];
      let match;
      while ((match = transRegex.exec(transitionsStr)) !== null) {
        transitions.push(`${match[1]}(${match[2]})`);
      }
      
      return `${id.padEnd(maxIdLen + 2)} - ${type.padEnd(maxTypeLen + 2)} - ${transitions.join(" ")}`;
    }).join("\n");
    setInputText(formatted);
  };

  const copyGraphData = () => {
    navigator.clipboard.writeText(inputText);
    setCopiedData(true);
    setTimeout(() => setCopiedData(false), 2000);
  };

  const copyInstructions = () => {
    navigator.clipboard.writeText(LLM_INSTRUCTIONS);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const downloadSVG = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = svgUrl;
    downloadLink.download = "dfa-nfa-graph.svg";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-500/30 overflow-x-hidden">
      {/* Tour Overlay */}
      <AnimatePresence>
        {showTour && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-6 bg-zinc-950/40 backdrop-blur-[2px]"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-zinc-900/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-[0_0_50px_-12px_rgba(59,130,246,0.3)] relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-white/5">
                <motion.div 
                  className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                  initial={{ width: "0%" }}
                  animate={{ width: `${((tourStep + 1) / 4) * 100}%` }}
                />
              </div>

              <div className="mb-6">
                <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/20">
                  {tourStep === 0 && <Terminal className="w-6 h-6 text-blue-400" />}
                  {tourStep === 1 && <Sparkles className="w-6 h-6 text-blue-400" />}
                  {tourStep === 2 && <RefreshCw className="w-6 h-6 text-blue-400" />}
                  {tourStep === 3 && <Download className="w-6 h-6 text-blue-400" />}
                </div>
                <h2 className="text-xl font-bold mb-2 text-white tracking-tight">
                  {tourStep === 0 && "Manual Editor"}
                  {tourStep === 1 && "AI Assistant"}
                  {tourStep === 2 && "Visualization"}
                  {tourStep === 3 && "Export & Share"}
                </h2>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {tourStep === 0 && "Define your states and transitions manually using our simple notation. Use the 'Format' button to keep things tidy."}
                  {tourStep === 1 && "Describe your machine in plain English and let our AI architect the DFA or NFA for you instantly."}
                  {tourStep === 2 && "Interact with your machine. Drag nodes, zoom in/out, and see your logic come to life in real-time."}
                  {tourStep === 3 && "Export your work as high-quality SVG or copy the notation to share with others or use in your projects."}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <button 
                  onClick={completeTour}
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Skip
                </button>
                <div className="flex gap-3">
                  {tourStep > 0 && (
                    <Button variant="outline" onClick={() => setTourStep(s => s - 1)}>
                      Back
                    </Button>
                  )}
                  <Button 
                    variant="primary" 
                    onClick={() => {
                      if (tourStep < 3) setTourStep(s => s + 1);
                      else completeTour();
                    }}
                  >
                    {tourStep === 3 ? "Finish" : "Next Step"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between bg-zinc-950/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
            <RefreshCw className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">LLM-DFA Gen</h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em]">Automata Visualizer</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setInputText("")}>
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
          <Button variant="outline" onClick={copyGraphData}>
            <Copy className={`w-4 h-4 ${copiedData ? 'text-green-500' : ''}`} />
            <span className="hidden sm:inline">{copiedData ? 'Copied!' : 'Copy Data'}</span>
          </Button>
          <Button variant="outline" onClick={copyInstructions}>
            <Copy className={`w-4 h-4 ${copiedPrompt ? 'text-green-500' : ''}`} />
            <span className="hidden sm:inline">{copiedPrompt ? 'Copied!' : 'LLM Prompt'}</span>
          </Button>
          <Button variant="secondary" onClick={downloadSVG}>
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export SVG</span>
          </Button>
        </div>
      </header>

      <main className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto">
        {/* Left Panel: Input & Instructions */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Tab Switcher */}
          <div className="flex p-1 bg-zinc-900/50 rounded-xl border border-zinc-800">
            <button 
              onClick={() => setActiveTab('manual')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'manual' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Manual Editor
            </button>
            <button 
              onClick={() => setActiveTab('ai')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'ai' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Assistant
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'manual' ? (
              <motion.div
                key="manual-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-6"
              >
            {/* Editor Card */}
            <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
              <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-2 text-zinc-400">
                  <Terminal className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">Instruction Editor</span>
                </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setInputText("")}
                        className="px-2 py-1 hover:bg-zinc-800 rounded text-[10px] font-bold uppercase tracking-wider text-zinc-500 transition-colors"
                      >
                        Clear
                      </button>
                      <button 
                        onClick={formatInput}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors"
                        title="Standardize formatting"
                      >
                        Format
                      </button>
                      <AnimatePresence>
                        {error && (
                          <motion.div 
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="flex items-center gap-1.5 text-red-500 text-xs font-medium"
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Syntax Error</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    spellCheck={false}
                    className="w-full h-[350px] bg-zinc-950/30 p-4 font-mono text-sm resize-none focus:outline-none text-blue-400 leading-relaxed"
                    placeholder="q0 - start - 1(q2) 0(qt)..."
                  />
                </div>

            {/* Templates Card */}
            <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-2xl p-4 shadow-2xl">
              <div className="flex items-center gap-2 mb-3 text-zinc-400">
                <Play className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">Templates</span>
              </div>
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => setInputText(EXAMPLES.binary_div_3)}
                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors"
                    >
                      Divisible by 3
                    </button>
                    <button 
                      onClick={() => setInputText(EXAMPLES.ends_with_01)}
                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors"
                    >
                      Ends with 01
                    </button>
                    <button 
                      onClick={() => setInputText(EXAMPLES.even_zeros)}
                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors"
                    >
                      Even Zeros
                    </button>
                  </div>
                </div>

            {/* Instructions Card */}
            <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center gap-2 mb-4 text-zinc-400">
                <Info className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">Notation Reference</span>
              </div>
                  <div className="space-y-4 text-sm text-zinc-400">
                    <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800 font-mono text-xs">
                      <span className="text-blue-400">q0</span> - <span className="text-green-400">start</span> - <span className="text-purple-400">0(q1) 1(q0)</span>
                    </div>
                    <ul className="space-y-2 text-xs leading-relaxed">
                      <li className="flex gap-2">
                        <span className="text-blue-400 font-bold shrink-0">ID:</span>
                        <span>Any alphanumeric string (e.g., q0, A, state1).</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-green-400 font-bold shrink-0">TYPE:</span>
                        <span>start, accept, trap, normal (can combine: start,accept).</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-purple-400 font-bold shrink-0">TRANS:</span>
                        <span>Use <code className="bg-zinc-800 px-1 rounded">input(target)</code>. Group inputs with commas: <code className="bg-zinc-800 px-1 rounded">0,1(q1)</code>.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="ai-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-6"
              >
                {/* AI Generator Card */}
                <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-2xl p-5 shadow-2xl border-blue-500/10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-blue-400">
                      <Sparkles className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-widest">Describe your machine</span>
                    </div>
                    {aiPrompt && (
                      <button 
                        onClick={() => setAiPrompt("")}
                        className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-4">
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      className="w-full h-32 bg-zinc-950/50 border border-zinc-800/50 rounded-xl p-4 text-sm text-zinc-300 focus:outline-none focus:border-blue-500/50 transition-colors resize-none leading-relaxed"
                      placeholder="e.g., 'A DFA that accepts strings over {0,1} where every 0 is immediately followed by a 1'..."
                    />
                    <Button 
                      onClick={generateWithAI} 
                      className="w-full justify-center py-4"
                      variant="primary"
                      disabled={isGenerating || !aiPrompt.trim()}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Architecting Machine...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Generate Automata
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* AI Tips */}
                <div className="bg-blue-500/5 backdrop-blur-xl border border-blue-500/10 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3 text-blue-400">
                    <Info className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">AI Capabilities</span>
                  </div>
                  <ul className="space-y-3 text-xs text-zinc-500 leading-relaxed">
                    <li className="flex gap-2">
                      <div className="w-1 h-1 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      <span>Can handle complex logical constraints and edge cases.</span>
                    </li>
                    <li className="flex gap-2">
                      <div className="w-1 h-1 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      <span>Automatically creates trap states and optimized transitions.</span>
                    </li>
                    <li className="flex gap-2">
                      <div className="w-1 h-1 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      <span>Understands standard automata theory terminology.</span>
                    </li>
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Panel: Visualization */}
        <div className={`lg:col-span-8 flex flex-col gap-4 ${isFullscreen ? 'fixed inset-0 z-50 p-4 bg-[#09090b]' : ''}`}>
          <div 
            ref={containerRef}
            className="relative flex-1 bg-[#121214] border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl min-h-[500px]"
          >
            {/* Graph Controls */}
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
              <button 
                onClick={resetZoom}
                className="p-2 bg-zinc-900/80 backdrop-blur border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400"
                title="Reset View"
              >
                <Maximize2 className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 bg-zinc-900/80 backdrop-blur border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400"
                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              >
                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
            </div>

            {/* Empty State Overlay */}
            {graphData.nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 bg-zinc-900/20 backdrop-blur-sm z-0">
                <Code className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm font-medium">Waiting for automata notation...</p>
              </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-6 left-6 flex gap-4 p-3 bg-zinc-900/50 backdrop-blur border border-zinc-800 rounded-xl z-10">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full border-2 border-blue-500 bg-zinc-900"></div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Start</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full border-2 border-emerald-500 bg-emerald-900/30"></div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Accept</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full border-2 border-rose-500 bg-rose-950/30"></div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Trap</span>
              </div>
            </div>

            {/* SVG Canvas */}
            <svg 
              ref={svgRef} 
              className="w-full h-full cursor-grab active:cursor-grabbing"
            />

            {/* Empty State */}
            {graphData.nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600">
                <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm font-medium">No valid nodes to display</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-white/5 p-8 text-center">
        <p className="text-zinc-600 text-[10px] font-bold tracking-[0.3em] uppercase">
          Built for LLM-Native Workflows • 2026
        </p>
      </footer>
      <Analytics />
    </div>
  );
}
