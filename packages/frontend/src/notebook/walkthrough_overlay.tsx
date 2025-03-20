import { Show, createEffect, createSignal } from "solid-js";
import "./walkthrough_overlay.css";

export function WalkthroughOverlay(props: { isOpen: boolean; onClose: () => void }) {
    const [currentStep, setCurrentStep] = createSignal(0);
    const totalSteps = 3;

    // For the intro carousel
    const [currentContentIndex, setCurrentContentIndex] = createSignal(0);
    const introContent = [
        {
            id: "sir-model",
            type: "image",
            src: "https://topos.institute/work/catcolab/examples/sir.png",
            alt: "A simple SIR (Susceptible, Infectious, or Recovered) model, along with a mass-actions dynamics visualisation",
            caption:
                "A simple SIR (Susceptible, Infectious, or Recovered) model, along with a mass-actions dynamics visualisation",
        },
        {
            id: "vortices",
            type: "video",
            src: "https://topos.institute/work/catcolab/examples/vortices.mov",
            alt: "Video showing inviscid vorticity visualization",
            caption:
                "Inviscid vorticity, visualised by automatic interfacing with Decapodes.jl in AlgebraicJulia",
        },
        {
            id: "emissions",
            type: "video",
            src: "https://topos.institute/work/catcolab/examples/emissions.mov",
            alt: "Video showing a cap-and-trade system model",
            caption:
                "Searching for feedback loops in a model of the impacts of a cap-and-trade system",
        },
    ];

    createEffect(() => {
        let timer: number;

        if (props.isOpen && currentStep() === 0) {
            timer = window.setInterval(() => {
                setCurrentContentIndex((currentContentIndex() + 1) % introContent.length);
            }, 5000);
        }

        return () => {
            if (timer) {
                clearInterval(timer);
            }
        };
    });

    const nextStep = () => {
        if (currentStep() < totalSteps - 1) {
            setCurrentStep(currentStep() + 1);
        } else {
            props.onClose();
        }
    };

    const prevStep = () => {
        if (currentStep() > 0) {
            setCurrentStep(currentStep() - 1);
        }
    };

    const skipWalkthrough = () => {
        props.onClose();
    };

    // Keyboard navigation
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "ArrowRight") {
            nextStep();
        } else if (event.key === "ArrowLeft") {
            prevStep();
        } else if (event.key === "Escape") {
            skipWalkthrough();
        }
    };

    // Attach event listener for keyboard navigation
    createEffect(() => {
        if (props.isOpen) {
            window.addEventListener("keydown", handleKeyDown);
        }
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    });

    return (
        <div
            class={`walkthrough-overlay ${props.isOpen ? "open" : ""}`}
            onClick={skipWalkthrough}
            role="dialog"
            aria-labelledby="walkthrough-title"
            aria-modal="true"
        >
            <div class="walkthrough-content" onClick={(e) => e.stopPropagation()}>
                <div class="header-container">
                    <img
                        src="https://topos.institute/assets/logo-name.png"
                        alt="Topos Institute"
                        class="topos-logo"
                    />
                </div>

                <Show when={currentStep() === 0}>
                    <div class="step-content fade-in">
                        <header>
                            <h1>Welcome to CatColab</h1>
                            <p>
                                A collaborative environment for formal, interoperable, conceptual
                                modeling
                            </p>
                        </header>
                        <div class="intro-content carousel">
                            {introContent.map((content) => (
                                <div
                                    key={content.id}
                                    data-key={content.id}
                                    classList={{
                                        "carousel-item": true,
                                        active:
                                            currentContentIndex() === introContent.indexOf(content),
                                    }}
                                >
                                    <div class="media-container">
                                        {content.type === "image" ? (
                                            <img src={content.src} alt={content.alt} />
                                        ) : (
                                            <video src={content.src} autoplay loop muted />
                                        )}
                                    </div>
                                    <p class="carousel-caption">{content.caption}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </Show>

                <Show when={currentStep() === 1}>
                    <div class="step-content fade-in">
                        <h2>Key Features</h2>
                        <div class="features-grid">
                            <div class="feature">
                                <span class="feature-icon">📐</span>
                                <h3>Formal Modeling</h3>
                                <p>
                                    Build precise, formal models using category theory and related
                                    formalisms
                                </p>
                            </div>
                            <div class="feature">
                                <span class="feature-icon">🔄</span>
                                <h3>Interoperability</h3>
                                <p>Connect and transform between different modeling languages</p>
                            </div>
                            <div class="feature">
                                <span class="feature-icon">👥</span>
                                <h3>Collaboration</h3>
                                <p>Work together with colleagues in real-time on shared models</p>
                            </div>
                            <div class="feature">
                                <span class="feature-icon">🔍</span>
                                <h3>Verification</h3>
                                <p>Check the consistency and correctness of your models</p>
                            </div>
                        </div>
                    </div>
                </Show>

                <Show when={currentStep() === 2}>
                    <div class="step-content fade-in">
                        <h2>Resources & Community</h2>
                        <div class="resources-container">
                            <div class="resources-list">
                                <a
                                    href="https://topos.institute/work/catcolab/"
                                    class="resource-link"
                                    target="_blank"
                                >
                                    <span class="resource-icon">🌐</span>
                                    <span>CatColab Overview</span>
                                </a>
                                <a
                                    href="https://catcolab.org/help/quick-intro"
                                    class="resource-link"
                                    target="_blank"
                                >
                                    <span class="resource-icon">💼</span>
                                    <span>Introduction</span>
                                </a>
                                <a
                                    href="https://topos.institute/blog/#category=CatColab"
                                    class="resource-link"
                                    target="_blank"
                                >
                                    <span class="resource-icon">🔬</span>
                                    <span>Blog & Use Cases</span>
                                </a>
                                <a
                                    href="https://catcolab.org/dev/index.xml"
                                    class="resource-link"
                                    target="_blank"
                                >
                                    <span class="resource-icon">📄</span>
                                    <span>Developer Documentation</span>
                                </a>
                                <a
                                    href="https://github.com/ToposInstitute/CatColab"
                                    class="resource-link"
                                    target="_blank"
                                >
                                    <span class="resource-icon">💻</span>
                                    <span>Source Code (GitHub)</span>
                                </a>
                                <a
                                    href="mailto:kevin@topos.institute"
                                    class="resource-link"
                                    target="_blank"
                                >
                                    <span class="resource-icon">📧</span>
                                    <span>Give Us Feedback</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </Show>

                <div class="footer-container">
                    <div class="progress-bar">
                        {Array.from({ length: totalSteps }).map((_, step) => {
                            const isActive = step === currentStep();
                            const isCompleted = step < currentStep();
                            return (
                                <div
                                    key={`step-dot-${step + 1}`}
                                    data-key={`step-dot-${step + 1}`}
                                    classList={{
                                        "progress-dot": true,
                                        active: isActive,
                                        completed: isCompleted,
                                    }}
                                    onClick={() => setCurrentStep(step)}
                                />
                            );
                        })}
                    </div>

                    <div class="navigation-buttons">
                        <Show when={currentStep() < totalSteps - 1}>
                            <button class="nav-button next" onClick={nextStep}>
                                Next
                            </button>
                        </Show>
                        <button class="nav-button get-started" onClick={props.onClose}>
                            {currentStep() < totalSteps - 1 ? "Get Started" : "Get Started"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
