/**
 * Country Selection Behavior
 *
 * Handles visual feedback when a country is selected:
 * - Increases selected country's altitude (extrusion)
 * - Shows country name label
 * - On deselection: resets altitude and hides label
 */

import { Scene } from '@babylonjs/core/scene';
import type { Nullable } from '@babylonjs/core/types';
import type { Observer } from '@babylonjs/core/Misc/observable';
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { Control } from '@babylonjs/gui/2D/controls/control';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import type { CountryPolygon, LatLon } from './countryPicker';

export interface SelectionBehaviorOptions {
    /** Altitude value for selected country (0-1, default: 0.5) */
    selectedAltitude?: number;
    /** Animation duration in milliseconds (default: 300) */
    animationDuration?: number;
    /** Label font size (default: "24px") */
    labelFontSize?: string;
    /** Label color (default: "white") */
    labelColor?: string;
    /** Label background color (default: "rgba(0,0,0,0.7)") */
    labelBackground?: string;
}

const DEFAULT_OPTIONS: Required<SelectionBehaviorOptions> = {
    selectedAltitude: 0.5,
    animationDuration: 300,
    labelFontSize: "24px",
    labelColor: "white",
    labelBackground: "rgba(0,0,0,0.7)"
};

/** Callback type for setting country altitude */
export type SetAltitudeCallback = (countryIndex: number, altitude: number) => void;

/** Callback type for getting country altitude */
export type GetAltitudeCallback = (countryIndex: number) => number;

// Max countries we can animate (matches MAX_ANIMATION_COUNTRIES in main.ts)
const MAX_ANIMATED = 256;

/**
 * Manages country selection visual behavior
 */
export class CountrySelectionBehavior {
    private scene: Scene;
    private advancedTexture: AdvancedDynamicTexture;
    private options: Required<SelectionBehaviorOptions>;
    private setAltitude: SetAltitudeCallback;
    private getAltitude: GetAltitudeCallback;

    private selectedCountry: CountryPolygon | null = null;
    private countryLabel: TextBlock | null = null;
    private labelContainer: Rectangle | null = null;

    // Animation state - pre-allocated arrays (no garbage per frame)
    private animationObserver: Nullable<Observer<Scene>> = null;
    private animTargets: Float32Array;    // Target altitude for each country (-1 = no animation)
    private animStartValues: Float32Array; // Start altitude when animation began
    private animStartTimes: Float32Array;  // Start time (ms) for each animation
    private animCount: number = 0;         // Number of active animations

    constructor(
        scene: Scene,
        advancedTexture: AdvancedDynamicTexture,
        setAltitude: SetAltitudeCallback,
        getAltitude: GetAltitudeCallback,
        options: SelectionBehaviorOptions = {}
    ) {
        this.scene = scene;
        this.advancedTexture = advancedTexture;
        this.setAltitude = setAltitude;
        this.getAltitude = getAltitude;
        this.options = { ...DEFAULT_OPTIONS, ...options };

        // Pre-allocate animation arrays
        this.animTargets = new Float32Array(MAX_ANIMATED);
        this.animStartValues = new Float32Array(MAX_ANIMATED);
        this.animStartTimes = new Float32Array(MAX_ANIMATED);
        // Initialize targets to -1 (no animation)
        this.animTargets.fill(-1);

        this.createLabel();
    }

    /**
     * Handle country selection - call this from the country selected callback
     */
    public onCountrySelected(country: CountryPolygon | null, latLon: LatLon): void {
        // Deselect previous country if different
        if (this.selectedCountry && (!country || country.iso2 !== this.selectedCountry.iso2)) {
            this.deselectCountry(this.selectedCountry);
            this.selectedCountry = null;
        }

        if (country) {
            this.selectCountry(country, latLon);
        } else {
            this.hideLabel();
        }
    }

    /**
     * Manually deselect the current country
     */
    public deselectCurrent(): void {
        if (this.selectedCountry) {
            this.deselectCountry(this.selectedCountry);
            this.selectedCountry = null;
        }
        this.hideLabel();
    }

    /**
     * Get the currently selected country
     */
    public getSelectedCountry(): CountryPolygon | null {
        return this.selectedCountry;
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        this.stopAllAnimations();
        if (this.labelContainer) {
            this.advancedTexture.removeControl(this.labelContainer);
            this.labelContainer.dispose();
        }
    }

    private createLabel(): void {
        // Create container rectangle for the label
        const container = new Rectangle("countryLabelContainer");
        container.width = "auto";
        container.height = "auto";
        container.adaptWidthToChildren = true;
        container.adaptHeightToChildren = true;
        container.cornerRadius = 8;
        container.color = "transparent";
        container.thickness = 0;
        container.background = this.options.labelBackground;
        container.paddingLeft = "12px";
        container.paddingRight = "12px";
        container.paddingTop = "8px";
        container.paddingBottom = "8px";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        container.top = "60px";
        container.isVisible = false;

        // Create text label
        const label = new TextBlock("countryLabel");
        label.text = "";
        label.color = this.options.labelColor;
        label.fontSize = this.options.labelFontSize;
        label.fontWeight = "bold";
        label.resizeToFit = true;
        label.textWrapping = true;  // Enable text wrapping

        container.addControl(label);
        this.advancedTexture.addControl(container);

        this.labelContainer = container;
        this.countryLabel = label;
    }

    private selectCountry(country: CountryPolygon, latLon: LatLon): void {
        this.selectedCountry = country;

        // Show and update label
        if (this.countryLabel && this.labelContainer) {
            this.countryLabel.text = country.name;
            this.labelContainer.isVisible = true;
        }

        // Set altitude immediately (no animation for hover feedback)
        this.animateAltitude(country.countryIndex, this.options.selectedAltitude, false);
        console.log(`Selected: ${country.name} (${country.iso2})`);
    }

    private deselectCountry(country: CountryPolygon): void {
        // Reset altitude immediately (no animation for hover feedback)
        this.animateAltitude(country.countryIndex, 0, false);
        console.log(`Deselected: ${country.name} (${country.iso2})`);
    }

    private hideLabel(): void {
        if (this.labelContainer) {
            this.labelContainer.isVisible = false;
        }
    }

    private animateAltitude(countryIndex: number, targetValue: number, animate: boolean = true): void {
        if (countryIndex < 0 || countryIndex >= MAX_ANIMATED) return;

        // Immediate jump - no animation
        if (!animate) {
            // Clear any pending animation for this country
            if (this.animTargets[countryIndex] >= 0) {
                this.animTargets[countryIndex] = -1;
                this.animCount--;
            }
            this.setAltitude(countryIndex, targetValue);
            return;
        }

        // Get current altitude as start value (handles interrupting ongoing animations)
        const currentAltitude = this.getAltitude(countryIndex);

        // Check if this is a new animation
        const isNew = this.animTargets[countryIndex] < 0;

        // Set animation state in pre-allocated arrays
        this.animTargets[countryIndex] = targetValue;
        this.animStartValues[countryIndex] = currentAltitude;
        this.animStartTimes[countryIndex] = performance.now();

        if (isNew) {
            this.animCount++;
        }

        // Start the animation loop if not already running
        this.ensureAnimationLoop();
    }

    private ensureAnimationLoop(): void {
        if (this.animationObserver) return;

        this.animationObserver = this.scene.onBeforeRenderObservable.add(() => {
            const now = performance.now();
            const duration = this.options.animationDuration;

            // Update all active animations (iterate through array, no allocations)
            for (let i = 0; i < MAX_ANIMATED; i++) {
                const target = this.animTargets[i];
                if (target < 0) continue;  // No animation for this country

                const elapsed = now - this.animStartTimes[i];
                const progress = Math.min(elapsed / duration, 1);

                // Ease out cubic
                const eased = 1 - Math.pow(1 - progress, 3);

                const startValue = this.animStartValues[i];
                const currentValue = startValue + (target - startValue) * eased;
                this.setAltitude(i, currentValue);

                // Mark as complete
                if (progress >= 1) {
                    this.animTargets[i] = -1;  // Clear animation
                    this.animCount--;
                }
            }

            // Stop the loop if no more animations
            if (this.animCount <= 0) {
                this.animCount = 0;
                this.stopAnimationLoop();
            }
        });
    }

    private stopAnimationLoop(): void {
        if (this.animationObserver) {
            this.scene.onBeforeRenderObservable.remove(this.animationObserver);
            this.animationObserver = null;
        }
    }

    private stopAllAnimations(): void {
        this.animTargets.fill(-1);
        this.animCount = 0;
        this.stopAnimationLoop();
    }
}
