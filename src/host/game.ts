/**
 * Game Module
 * Handles game logic - what happens when pins are placed
 */

import type { CountryPolygon, LatLon } from '../countryPicker';

export class Game {
    private clearedCountries: Set<string> = new Set();
    private score: number = 0;
    private onCountryClearedCallback: ((country: CountryPolygon) => void) | null = null;

    start(): void {
        console.log('Game started!');
    }

    handlePinPlaced(country: CountryPolygon | null, latLon: LatLon): void {
        if (!country) {
            console.log('Pin placed in ocean - no country to clear');
            return;
        }

        if (this.clearedCountries.has(country.iso2)) {
            console.log(`Country ${country.name} already cleared!`);
            return;
        }

        this.clearCountry(country);
    }

    isCountryCleared(iso2: string): boolean {
        return this.clearedCountries.has(iso2);
    }

    getClearedCountries(): Set<string> {
        return new Set(this.clearedCountries);
    }

    getScore(): number {
        return this.score;
    }

    onCountryCleared(callback: (country: CountryPolygon) => void): void {
        this.onCountryClearedCallback = callback;
    }

    private clearCountry(country: CountryPolygon): void {
        this.clearedCountries.add(country.iso2);
        this.score += 100;

        console.log(`Cleared ${country.name}! Score: ${this.score}, Total cleared: ${this.clearedCountries.size}`);

        if (this.onCountryClearedCallback) {
            this.onCountryClearedCallback(country);
        }
    }
}
