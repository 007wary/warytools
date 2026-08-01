// Conversion factors are relative to a base unit per category.
// Temperature needs formulas instead of a factor, so it's handled separately.

export const unitCategories = {
  length: {
    label: "Length",
    baseUnit: "meter",
    units: {
      millimeter: { label: "Millimeter (mm)", toBase: 0.001 },
      centimeter: { label: "Centimeter (cm)", toBase: 0.01 },
      meter: { label: "Meter (m)", toBase: 1 },
      kilometer: { label: "Kilometer (km)", toBase: 1000 },
      inch: { label: "Inch (in)", toBase: 0.0254 },
      foot: { label: "Foot (ft)", toBase: 0.3048 },
      yard: { label: "Yard (yd)", toBase: 0.9144 },
      mile: { label: "Mile (mi)", toBase: 1609.344 },
    },
  },
  weight: {
    label: "Weight",
    baseUnit: "kilogram",
    units: {
      milligram: { label: "Milligram (mg)", toBase: 0.000001 },
      gram: { label: "Gram (g)", toBase: 0.001 },
      kilogram: { label: "Kilogram (kg)", toBase: 1 },
      tonne: { label: "Tonne (t)", toBase: 1000 },
      ounce: { label: "Ounce (oz)", toBase: 0.0283495 },
      pound: { label: "Pound (lb)", toBase: 0.453592 },
    },
  },
  temperature: {
    label: "Temperature",
    units: {
      celsius: { label: "Celsius (°C)" },
      fahrenheit: { label: "Fahrenheit (°F)" },
      kelvin: { label: "Kelvin (K)" },
    },
  },
};

export function convertLinear(value, category, fromUnit, toUnit) {
  const { units } = unitCategories[category];
  const baseValue = value * units[fromUnit].toBase;
  return baseValue / units[toUnit].toBase;
}

export function convertTemperature(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;

  // Convert to Celsius first, then to the target unit.
  let celsius;
  if (fromUnit === "celsius") celsius = value;
  else if (fromUnit === "fahrenheit") celsius = ((value - 32) * 5) / 9;
  else celsius = value - 273.15; // kelvin

  if (toUnit === "celsius") return celsius;
  if (toUnit === "fahrenheit") return (celsius * 9) / 5 + 32;
  return celsius + 273.15; // kelvin
}
