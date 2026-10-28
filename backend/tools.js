// ========================================
// ENERGY TOOL
// ========================================

function analyzeEnergy(energy) {

    if (energy > 300) {

        return {
            problem: "High electricity consumption",
            priority: "High",
            recommendation:
                "Reduce unnecessary electricity usage and switch off unused appliances."
        };

    }

    return {
        problem: null,
        priority: "Low",
        recommendation:
            "Energy consumption is within the configured range."
    };
}


// ========================================
// WATER TOOL
// ========================================

function analyzeWater(water) {

    if (water > 500) {

        return {
            problem: "High water consumption",
            priority: "High",
            recommendation:
                "Check for leakage and reduce unnecessary water usage."
        };

    }

    return {
        problem: null,
        priority: "Low",
        recommendation:
            "Water consumption is within the configured range."
    };
}


// ========================================
// WASTE TOOL
// ========================================

function analyzeWaste(waste) {

    if (waste > 20) {

        return {
            problem: "High waste generation",
            priority: "Medium",
            recommendation:
                "Increase recycling and reduce single-use materials."
        };

    }

    return {
        problem: null,
        priority: "Low",
        recommendation:
            "Waste generation is within the configured range."
    };
}


// ========================================
// CARBON TOOL
// ========================================

function analyzeCarbon(co2) {

    if (co2 > 100) {

        return {
            problem: "High CO2 emissions",
            priority: "High",
            recommendation:
                "Use public transport and reduce fuel consumption."
        };

    }

    return {
        problem: null,
        priority: "Low",
        recommendation:
            "CO2 emissions are within the configured range."
    };
}


// ========================================
// CLIMATE TOOL
// ========================================

function analyzeClimate(temperature, rainfall) {

    const results = [];

    if (temperature > 35) {

        results.push({
            problem: "High temperature condition",
            priority: "High",
            recommendation:
                "Monitor heat conditions and reduce unnecessary energy usage."
        });

    }

    if (rainfall > 0 && rainfall < 20) {

        results.push({
            problem: "Low rainfall condition",
            priority: "Medium",
            recommendation:
                "Conserve water and consider rainwater harvesting."
        });

    }

    return results;
}


export {
    analyzeEnergy,
    analyzeWater,
    analyzeWaste,
    analyzeCarbon,
    analyzeClimate
};