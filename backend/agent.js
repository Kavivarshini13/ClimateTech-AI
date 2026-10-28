import {
    analyzeEnergy,
    analyzeWater,
    analyzeWaste,
    analyzeCarbon,
    analyzeClimate
} from "./tools.js";


// ========================================
// CLIMATE AGENT
// ========================================

async function runClimateAgent(data) {

    const {
        energy,
        water,
        waste,
        co2,
        temperature,
        rainfall,
        location
    } = data;


    // ------------------------------------
    // OBSERVE
    // ------------------------------------

    const observations = [

        `Energy consumption: ${energy} kWh`,

        `Water consumption: ${water} litres`,

        `Waste generation: ${waste} kg`,

        `CO2 emissions: ${co2} kg`,

        `Temperature: ${temperature || "Not provided"}°C`,

        `Rainfall: ${rainfall || "Not provided"} mm`

    ];


    // ------------------------------------
    // ANALYZE
    // ------------------------------------

    const problems = [];

    const recommendations = [];

    const actions = [];


    // Energy Agent Tool

    const energyResult =
        analyzeEnergy(Number(energy));

    if (energyResult.problem) {

        problems.push(energyResult.problem);

        recommendations.push(
            energyResult.recommendation
        );

        actions.push({
            category: "Energy",
            priority: energyResult.priority,
            action: energyResult.recommendation
        });

    }


    // Water Agent Tool

    const waterResult =
        analyzeWater(Number(water));

    if (waterResult.problem) {

        problems.push(waterResult.problem);

        recommendations.push(
            waterResult.recommendation
        );

        actions.push({
            category: "Water",
            priority: waterResult.priority,
            action: waterResult.recommendation
        });

    }


    // Waste Agent Tool

    const wasteResult =
        analyzeWaste(Number(waste));

    if (wasteResult.problem) {

        problems.push(wasteResult.problem);

        recommendations.push(
            wasteResult.recommendation
        );

        actions.push({
            category: "Waste",
            priority: wasteResult.priority,
            action: wasteResult.recommendation
        });

    }


    // Carbon Agent Tool

    const carbonResult =
        analyzeCarbon(Number(co2));

    if (carbonResult.problem) {

        problems.push(carbonResult.problem);

        recommendations.push(
            carbonResult.recommendation
        );

        actions.push({
            category: "Carbon",
            priority: carbonResult.priority,
            action: carbonResult.recommendation
        });

    }


    // Climate Tool

    const climateResults =
        analyzeClimate(
            Number(temperature),
            Number(rainfall)
        );

    climateResults.forEach(result => {

        problems.push(result.problem);

        recommendations.push(
            result.recommendation
        );

        actions.push({
            category: "Climate",
            priority: result.priority,
            action: result.recommendation
        });

    });


    // ------------------------------------
    // DECISION
    // ------------------------------------

    let score = 100;

    score -= problems.length * 15;

    if (score < 0) {
        score = 0;
    }


    let riskLevel;

    if (score >= 80) {

        riskLevel = "Low";

    } else if (score >= 60) {

        riskLevel = "Medium";

    } else {

        riskLevel = "High";

    }


    // ------------------------------------
    // AGENT DECISION
    // ------------------------------------

    let decision;

    if (riskLevel === "High") {

        decision =
            "Multiple environmental problems were detected. Immediate sustainability actions are recommended.";

    } else if (riskLevel === "Medium") {

        decision =
            "Some environmental indicators require attention. Follow the recommended actions and continue monitoring.";

    } else {

        decision =
            "Environmental indicators are currently within the configured range. Continue sustainable practices.";

    }


    // ------------------------------------
    // NO PROBLEM
    // ------------------------------------

    if (problems.length === 0) {

        recommendations.push(
            "Continue your current sustainable practices."
        );

        actions.push({
            category: "Sustainability",
            priority: "Low",
            action: "Continue sustainable practices"
        });

    }


    // ------------------------------------
    // FINAL AGENT RESPONSE
    // ------------------------------------

    return {

        agent: "EcoAgent",

        location: location || "Unknown",

        workflow: [
            "Observe",
            "Analyze",
            "Decide",
            "Recommend"
        ],

        observations,

        sustainabilityScore: score,

        riskLevel,

        problems,

        recommendations,

        actions,

        decision,

        timestamp: new Date().toISOString()

    };

}


export {
    runClimateAgent
};
